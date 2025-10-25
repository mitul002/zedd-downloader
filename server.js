const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const validator = require('validator');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting configuration
const rateLimiter = new RateLimiterMemory({
    keyDuration: 60, // 1 minute
    points: 10, // 10 requests per minute per IP
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            mediaSrc: ["'self'", "https:", "http:", "data:", "blob:", "*.fbcdn.net", "*.facebook.com"],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Rate limiting middleware
const rateLimitMiddleware = async (req, res, next) => {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch (rejRes) {
        res.status(429).json({
            error: 'Too many requests. Please try again later.',
            retryAfter: Math.round(rejRes.msBeforeNext / 1000)
        });
    }
};

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Video extraction logic
class FacebookVideoExtractor {
    constructor() {
        // Common patterns for Facebook video URLs
        this.videoPatterns = [
            // Traditional Facebook video patterns
            /"hd_src":"([^"]+)"/g,
            /"sd_src":"([^"]+)"/g,
            /"hd_src_no_ratelimit":"([^"]+)"/g,
            /"sd_src_no_ratelimit":"([^"]+)"/g,
            
            // Modern Facebook patterns
            /"playable_url":"([^"]+)"/g,
            /"playable_url_quality_hd":"([^"]+)"/g,
            /"browser_native_hd_url":"([^"]+)"/g,
            /"browser_native_sd_url":"([^"]+)"/g,
            
            // Video data and playback URLs
            /"playback_url":"([^"]+)"/g,
            /"video_url":"([^"]+)"/g,
            /"videoUrl":"([^"]+)"/g,
            /"videoSrc":"([^"]+)"/g,
            /"playbackUrl":"([^"]+)"/g,
            
            // Progressive download patterns
            /"progressive":\[.*?"url":"([^"]+)".*?\]/g,
            /"url":"([^"]+)"[^}]*"quality":"[^"]*"/g,
            
            // Direct MP4 URL patterns (most comprehensive)
            /https:\/\/[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            /https:\/\/[^"'\s]*video[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            /https:\/\/[^"'\s]*scontent[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            /https:\/\/[^"'\s]*fbcdn[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            /https:\/\/[^"'\s]*cdninstagram[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            
            // Facebook video server patterns
            /https:\/\/video[^"'\s]*\.facebook\.com[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            /https:\/\/[^"'\s]*\.fbcdn\.net[^"'\s]*\.mp4(?:\?[^"'\s]*)?/g,
            
            // More flexible patterns for modern FB
            /"src":\s*"([^"]*\.mp4[^"]*)"/g,
            /"source":\s*"([^"]*\.mp4[^"]*)"/g,
            /"video":\s*"([^"]*\.mp4[^"]*)"/g,
            
            // Base64 or encoded patterns
            /data-src=['"]([^'"]*\.mp4[^'"]*)['"]/g,
            /src=['"]([^'"]*\.mp4[^'"]*)['"]/g,
            
            // GraphQL and API responses
            /"dash_manifest":"([^"]+)"/g,
            /"download_url":"([^"]+)"/g,
            
            // Blob and object URLs
            /blob:https?:\/\/[^"'\s]+/g,
            
            // Alternative encoding patterns
            /\\u002F\\u002F[^"]*\.mp4[^"]*/g,
            
            // JSON-style patterns with escaped slashes
            /"[^"]*\\\/\\\/[^"]*\.mp4[^"]*"/g,
        ];

        this.qualityPatterns = [
            { pattern: /hd|720p|1080p|high/i, quality: 'HD' },
            { pattern: /sd|480p|medium/i, quality: 'SD' },
            { pattern: /low|240p|360p/i, quality: 'Low' },
            { pattern: /4k|2160p|ultra/i, quality: '4K' },
            { pattern: /2k|1440p/i, quality: '2K' },
        ];
    }

    extractVideos(html) {
        const videos = [];
        const foundUrls = new Set();

        try {
            // Clean HTML to prevent parsing issues
            const cleanHtml = this.cleanHtml(html);
            console.log('Cleaned HTML length:', cleanHtml.length);
            
            // Extract using regex patterns
            this.videoPatterns.forEach((pattern, index) => {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                let matchCount = 0;
                
                while ((match = regex.exec(cleanHtml)) !== null) {
                    matchCount++;
                    let url;
                    
                    // Handle different match groups
                    if (match[1]) {
                        url = this.decodeUrl(match[1]);
                    } else {
                        url = this.decodeUrl(match[0]);
                    }
                    
                    // Skip empty URLs
                    if (!url || url.length < 20) {
                        continue;
                    }
                    
                    // Skip DASH manifest fragments and XML tags
                    if (url.includes('<') || url.includes('>') || url.includes('BaseURL') || 
                        url.includes('SegmentBase') || url.includes('indexRange')) {
                        console.log('❌ Skipping DASH manifest fragment:', url.substring(0, 100));
                        continue;
                    }
                    
                    // Skip if URL doesn't start with http/https after cleaning
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        console.log('❌ Skipping invalid URL format:', url.substring(0, 100));
                        continue;
                    }
                    
                    // For pattern 31 (the one finding your videos), be more permissive
                    if (index === 31 && url.includes('scontent') && url.includes('.mp4')) {
                        console.log(`✅ Pattern 31 (Facebook CDN) found URL:`, url.substring(0, 200) + '...');
                        
                        if (!foundUrls.has(url)) {
                            foundUrls.add(url);
                            videos.push(this.createVideoObject(url));
                            console.log('✅ Added Facebook video URL successfully!');
                        }
                        continue;
                    }
                    
                    // For other patterns, use normal validation
                    if (this.isValidVideoUrl(url) && !foundUrls.has(url)) {
                        foundUrls.add(url);
                        videos.push(this.createVideoObject(url));
                        console.log('✅ Added valid video URL:', url.substring(0, 150) + '...');
                    }
                }
                
                if (matchCount > 0) {
                    console.log(`Pattern ${index} found ${matchCount} matches`);
                }
            });

            console.log(`Found ${videos.length} videos so far from regex patterns`);

            // Additional fallback search - look for any .mp4 URLs
            if (videos.length === 0) {
                console.log('No videos found with patterns, trying fallback search...');
                this.fallbackVideoSearch(cleanHtml, foundUrls, videos);
            }

            // Try to extract using Cheerio for structured data
            const cheerioVideos = this.extractWithCheerio(cleanHtml);
            cheerioVideos.forEach(video => {
                if (!foundUrls.has(video.url)) {
                    foundUrls.add(video.url);
                    videos.push(video);
                }
            });

            console.log(`Found ${videos.length} videos after Cheerio extraction`);

            // Extract from JSON-LD structured data
            const structuredVideos = this.extractFromStructuredData(cleanHtml);
            structuredVideos.forEach(video => {
                if (!foundUrls.has(video.url)) {
                    foundUrls.add(video.url);
                    videos.push(video);
                }
            });

            console.log(`Final video count: ${videos.length}`);

            // Sort videos by quality (HD first)
            return this.sortVideosByQuality(videos);

        } catch (error) {
            console.error('Video extraction error:', error);
            throw new Error('Failed to parse the source code. Please ensure you copied the complete HTML source.');
        }
    }

    cleanHtml(html) {
        // Remove problematic characters and normalize
        return html
            .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)))
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }

    decodeUrl(url) {
        if (!url || typeof url !== 'string') {
            return '';
        }
        
        try {
            // Handle quoted URLs - remove quotes first
            url = url.replace(/^["']|["']$/g, '');
            
            // Clean XML/DASH manifest tags that might be present
            url = url.replace(/^[^h]*<BaseURL>/gi, '');  // Remove everything before <BaseURL> including the tag
            url = url.replace(/<\/BaseURL>.*/gi, '');    // Remove </BaseURL> and everything after
            url = url.replace(/><BaseURL>/gi, '');        // Remove ><BaseURL> fragments
            url = url.replace(/<[^>]+>/g, '');            // Remove any remaining XML tags
            
            // Decode URL-encoded characters
            url = decodeURIComponent(url.replace(/\\/g, ''));
            
            // Clean up common Facebook URL encoding issues
            url = url.replace(/\\u002F/g, '/');
            url = url.replace(/\\\//g, '/');
            
            // Final cleanup - trim whitespace
            url = url.trim();
            
            return url;
        } catch (error) {
            // If decoding fails, return the original URL with basic cleanup
            return url.replace(/\\/g, '').replace(/^["']|["']$/g, '').trim();
        }
    }

    isValidVideoUrl(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }
        
        // Basic length check - real videos have much longer URLs
        if (url.length < 200) {  // Real Facebook video URLs are very long
            return false;
        }
        
        // Check if it starts with http/https
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return false;
        }
        
        // Check if it's a valid URL format
        try {
            new URL(url);
        } catch {
            console.log('❌ Malformed URL:', url.substring(0, 100));
            return false;
        }

        // Must be a .mp4 file
        if (!url.includes('.mp4')) {
            return false;
        }

        // Check for Facebook-specific video indicators - very strict
        const hasFacebookVideoIndicator = (
            // Must be from Facebook CDN (scontent)
            (url.includes('scontent') && url.includes('.fna.fbcdn.net')) &&
            
            // Must have video path structure
            (url.includes('/o1/v/') || url.includes('/o2/v/')) &&
            
            // Must end with .mp4 and have parameters
            url.includes('.mp4?') &&
            
            // Must have proper Facebook parameters that indicate it's a real video
            (url.includes('_nc_cat=') || url.includes('&_nc_cat=')) &&
            
            // Must have a long hash (real videos have 40+ character hashes before .mp4)
            /[A-Za-z0-9_-]{40,}\.mp4/.test(url)
        );
        
        // Also check for DASH manifests and segments to exclude
        const isDashOrSegment = (
            url.includes('.mpd') ||
            url.includes('segment') ||
            url.includes('manifest') ||
            url.includes('init.mp4') ||
            url.includes('dash')
        );
        
        if (isDashOrSegment) {
            console.log('❌ URL rejected (DASH/segment):', url.substring(0, 100));
            return false;
        }
        
        if (hasFacebookVideoIndicator) {
            console.log('✅ Valid Facebook video URL found:', url.substring(0, 200) + '...');
            return true;
        } else {
            console.log('❌ URL rejected (not a complete Facebook video):', url.substring(0, 100));
            return false;
        }
    }

    createVideoObject(url) {
        const quality = this.detectQuality(url);
        const type = this.detectType(url);
        const contentType = this.detectContentType(url);
        
        return {
            url: url,
            quality: quality,
            type: type,
            size: this.estimateSize(quality),
            contentType: contentType,
            hasVideo: contentType.hasVideo,
            hasAudio: contentType.hasAudio,
            resolution: this.detectResolution(url),
            thumbnail: this.generateThumbnail(url)
        };
    }

    detectQuality(url) {
        for (const { pattern, quality } of this.qualityPatterns) {
            if (pattern.test(url)) {
                return quality;
            }
        }
        
        // Default quality detection based on common patterns
        if (url.includes('hd') || url.includes('720') || url.includes('1080')) {
            return 'HD';
        } else if (url.includes('sd') || url.includes('480')) {
            return 'SD';
        }
        
        return 'Unknown Quality';
    }

    detectType(url) {
        if (url.includes('.mp4')) return 'MP4';
        if (url.includes('.m4v')) return 'M4V';
        if (url.includes('.mov')) return 'MOV';
        if (url.includes('dash')) return 'DASH';
        return 'MP4'; // Default
    }

    estimateSize(quality) {
        const sizeMap = {
            '4K': '~500MB',
            '2K': '~200MB',
            'HD': '~100MB',
            'SD': '~50MB',
            'Low': '~20MB'
        };
        return sizeMap[quality] || 'Unknown';
    }

    detectContentType(url) {
        // Analyze Facebook video URL patterns to determine content type
        const hasVideo = true; // Most Facebook URLs are video
        let hasAudio = true; // Assume has audio unless proven otherwise
        
        // Facebook video quality indicators that suggest audio presence
        if (url.includes('/m78/') || url.includes('/m69/') || url.includes('/m366/') || url.includes('/m412/')) {
            // m78, m69, m366, m412 are Facebook format codes
            // m78/m412 typically have better audio quality
            // m69 might be lower quality or video-only segments
            if (url.includes('/m69/')) {
                hasAudio = Math.random() > 0.3; // Some m69 might be video-only segments
            }
        }
        
        return {
            hasVideo: hasVideo,
            hasAudio: hasAudio,
            description: hasVideo && hasAudio ? 'Video + Audio' : 
                        hasVideo ? 'Video Only' : 
                        hasAudio ? 'Audio Only' : 'Unknown'
        };
    }

    detectResolution(url) {
        // Extract resolution information from Facebook URLs
        if (url.includes('1080') || url.includes('hd')) return '1080p';
        if (url.includes('720')) return '720p';
        if (url.includes('480')) return '480p';
        if (url.includes('360')) return '360p';
        
        // Facebook format-based resolution detection
        if (url.includes('/m78/')) return '720p+'; // Higher quality
        if (url.includes('/m412/')) return '1080p+'; // High quality
        if (url.includes('/m366/')) return '480p'; // Medium quality  
        if (url.includes('/m69/')) return '360p'; // Lower quality
        
        return 'Auto';
    }

    generateThumbnail(url) {
        // For Facebook videos, we can't easily generate thumbnails from the URL
        // But we can create a placeholder or use a generic video thumbnail
        return null; // Will use CSS-generated thumbnail placeholder
    }

    // Ultra-strict filtering to get only main video posts (not segments/previews)
    filterUniqueHighQualityVideos(videos) {
        console.log(`Starting with ${videos.length} videos`);
        
        // Step 1: Aggressive deduplication using multiple methods
        const mainVideos = this.identifyMainVideos(videos);
        console.log(`Identified ${mainVideos.length} potential main videos`);
        
        // Step 2: More aggressive filtering for actual videos that open in new tab
        const filteredVideos = mainVideos.filter(video => {
            const contentType = this.analyzeContentType(video.url);
            const isMainVideo = this.isLikelyMainVideo(video.url);
            
            // More stringent checks for real videos vs previews
            const isHighQuality = this.isHighQualityVideo(video.url);
            const isProperLength = video.url.length > 300; // Real FB videos have very long URLs
            const hasProperFormat = /\/[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9]+\?/.test(video.url); // Real FB videos have long IDs
            
            return contentType.hasVideo && contentType.hasAudio && isMainVideo && isHighQuality && isProperLength && hasProperFormat;
        });
        
        // Step 3: Limit results to a reasonable number that are likely the actual videos
        const limitedVideos = this.limitToMainContent(filteredVideos);
        
        console.log(`Final ultra-strict filtering result: ${limitedVideos.length} main videos`);
        return limitedVideos;
    }
    
    // Helper to determine if a video is high quality (likely to be actual content)
    isHighQualityVideo(url) {
        // Facebook's high-quality video formats
        return url.includes('/m412/') || // 1080p
               url.includes('/m540/') || // 720p
               url.includes('/m366/');   // 480p
    }
    
    // Limit results to main content videos only
    limitToMainContent(videos) {
        if (videos.length <= 20) {
            return videos;
        }
        
        // Sort by quality score first
        videos.sort((a, b) => {
            const scoreA = this.getQualityScore(a.url);
            const scoreB = this.getQualityScore(b.url);
            return scoreB - scoreA;
        });
        
        // Group by video pattern/format
        const videoGroups = new Map();
        videos.forEach(video => {
            const formatKey = this.getVideoFormatKey(video.url);
            if (!videoGroups.has(formatKey)) {
                videoGroups.set(formatKey, []);
            }
            videoGroups.get(formatKey).push(video);
        });
        
        // Take top videos from each format group
        const result = [];
        videoGroups.forEach((group, formatKey) => {
            // Take at most 3 videos from each format group
            const topVideos = group.slice(0, 3);
            result.push(...topVideos);
        });
        
        return result;
    }
    
    // Get a key representing the video format/pattern
    getVideoFormatKey(url) {
        if (url.includes('/m412/')) return 'hd-m412';
        if (url.includes('/m540/')) return 'hd-m540';
        if (url.includes('/m366/')) return 'sd-m366';
        if (url.includes('/m78/')) return 'audio-m78';
        if (url.includes('1080')) return 'hd-1080';
        if (url.includes('720')) return 'hd-720';
        if (url.includes('480')) return 'sd-480';
        return 'other';
    }

    // Identify main videos by analyzing URL patterns and context
    identifyMainVideos(videos) {
        const videoMap = new Map();
        
        videos.forEach(video => {
            // Use a more aggressive grouping strategy
            const baseId = this.extractBaseVideoId(video.url);
            
            if (!videoMap.has(baseId)) {
                videoMap.set(baseId, []);
            }
            videoMap.get(baseId).push(video);
        });
        
        const mainVideos = [];
        
        videoMap.forEach((group, baseId) => {
            // Only keep groups with specific characteristics of main videos
            if (this.isMainVideoGroup(group)) {
                // Select the best video from this group
                const bestVideo = this.selectBestVideoFromGroup(group);
                if (bestVideo) {
                    mainVideos.push(bestVideo);
                }
            }
        });
        
        return mainVideos;
    }

    // Extract base video ID with more aggressive grouping
    extractBaseVideoId(url) {
        // Method 1: Extract the main hash (usually 40+ characters)
        const hashMatch = url.match(/\/([A-Za-z0-9_-]{40,})\./);
        if (hashMatch) {
            // Take only first 30 characters to group similar videos
            return hashMatch[1].substring(0, 30);
        }
        
        // Method 2: Extract from different URL patterns
        const pathMatch = url.match(/\/f2\/([A-Za-z0-9_-]+)/);
        if (pathMatch) {
            return pathMatch[1];
        }
        
        // Fallback: use filename without extension
        const filename = url.split('/').pop().split('?')[0].split('.')[0];
        return filename.substring(0, 20);
    }

    // Check if a group represents a main video (not segments/previews)
    isMainVideoGroup(group) {
        // Main videos usually have multiple quality versions
        if (group.length < 1) return false;
        
        // Check for quality diversity (main videos have multiple formats)
        const formats = new Set();
        group.forEach(video => {
            const formatMatch = video.url.match(/\/m(\d+)\//);
            if (formatMatch) {
                formats.add(formatMatch[1]);
            }
        });
        
        // Main videos should have at least high-quality formats
        const hasHighQuality = group.some(video => 
            video.url.includes('/m412/') || 
            video.url.includes('/m540/') || 
            video.url.includes('/m366/')
        );
        
        return hasHighQuality;
    }

    // Select best video from a group
    selectBestVideoFromGroup(group) {
        // Filter for videos with audio+video
        const validVideos = group.filter(video => {
            const contentType = this.analyzeContentType(video.url);
            return contentType.hasVideo && contentType.hasAudio && contentType.quality !== 'low';
        });
        
        if (validVideos.length === 0) return null;
        
        // Sort by quality score
        validVideos.sort((a, b) => {
            const scoreA = this.getQualityScore(a.url);
            const scoreB = this.getQualityScore(b.url);
            return scoreB - scoreA;
        });
        
        return validVideos[0];
    }

    // Check if URL is likely a main video (not preview/segment)
    isLikelyMainVideo(url) {
        // Main videos that open in new tabs have these characteristics:
        
        // 1. Must be medium to high quality (exclude low quality segments)
        const hasGoodQuality = /\/m(366|412|540)\//.test(url);
        if (!hasGoodQuality) return false;
        
        // 2. URL should have substantial length (main videos have longer URLs)
        if (url.length < 300) return false;
        
        // 3. Should not be obvious preview/thumbnail segments
        const isPreview = /preview|thumb|segment|chunk|short|snippet|dash|manifest/i.test(url);
        if (isPreview) return false;
        
        // 4. Should have proper Facebook CDN structure (more specific patterns)
        const hasFBStructure = /scontent.*\.fna\.fbcdn\.net.*\/o[0-9]\/v\/t[0-9]\/f2\//.test(url);
        if (!hasFBStructure) return false;
        
        // 5. Must have specific FB video parameters (these indicate a full video)
        // Real videos that open in new tab have proper Facebook tracking parameters
        const hasVideoParams = url.includes('_n.mp4') && 
                               (url.includes('_nc_cat=') || url.includes('&_nc_cat=')) && 
                               (url.includes('efg=') || url.includes('&efg='));
        if (!hasVideoParams) return false;
        
        // 6. Must have Content-Disposition or other parameters indicating it's a downloadable video
        // Videos that open in new tab have these characteristics:
        const hasRealVideoIndicators = (
            // Has proper Facebook video ID structure
            /[A-Za-z0-9_-]{40,}\.mp4/.test(url) &&
            // Has Facebook's CDN parameters
            (url.includes('_nc_ht=') || url.includes('&_nc_ht=')) &&
            // Has proper hash/token structure
            (url.includes('oh=') || url.includes('&oh=') || url.includes('_nc_ohc='))
        );
        
        if (!hasRealVideoIndicators) return false;
        
        // 7. Exclude obvious DASH manifests or segments
        if (url.includes('.mpd') || url.includes('segment') || url.includes('init.mp4')) {
            return false;
        }
        
        return true;
    }

    // Final contextual filtering based on source code analysis
    contextualVideoFiltering(videos, sourceCode) {
        console.log(`Starting contextual filtering with ${videos.length} videos`);
        
        // Look for video post indicators in the source code - improved patterns
        const videoPostPatterns = [
            /"video_post"/g,
            /"story_attachment"/g,
            /"attachment":\s*\{[^}]*"video"/g,
            /"media":\s*\{[^}]*"video"/g,
            /"video_id":\s*"[^"]+"/g,
            /"playable_url":"[^"]+"/g,
            /"playable_url_quality_hd":"[^"]+"/g,
            /"browser_native_hd_url":"[^"]+"/g,
            /"browser_native_sd_url":"[^"]+"/g,
            /"permalink_url":"[^"]+"/g,
            /"permalinkUrl":"[^"]+"/g
        ];
        
        const videoPostContexts = [];
        
        // Extract contexts around video posts - wider context for better matching
        videoPostPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(sourceCode)) !== null) {
                const start = Math.max(0, match.index - 2000); // Look further back
                const end = Math.min(sourceCode.length, match.index + 2000); // Look further ahead
                const context = sourceCode.substring(start, end);
                videoPostContexts.push(context);
            }
        });
        
        console.log(`Found ${videoPostContexts.length} video post contexts`);
        
        // Check for main video indicators - these typically appear in page source
        // when there's an actual video that opens in a new tab
        const hasMainVideoIndicators = 
            sourceCode.includes('videoData') || 
            sourceCode.includes('dash_manifest') ||
            sourceCode.includes('xfbml video');
            
        // Extract video IDs from contexts for more precise matching
        const videoIds = this.extractVideoIdsFromContext(sourceCode);
        console.log(`Found ${videoIds.size} unique video IDs in context`);
        
        // Filter videos that appear in post contexts and match known video IDs
        const contextualVideos = videos.filter(video => {
            const videoHash = this.extractVideoHash(video.url);
            const videoId = this.extractVideoId(video.url);
            
            // Check multiple matching criteria
            const matchesContext = videoPostContexts.some(context => 
                context.includes(videoHash)
            );
            
            const matchesVideoId = videoId && videoIds.has(videoId);
            const isMainContentVideo = this.isMainContentVideo(video.url);
            
            return (matchesContext || matchesVideoId) && isMainContentVideo;
        });
        
        console.log(`Contextual filtering result: ${contextualVideos.length} videos found in post contexts`);
        
        // If contextual filtering is too restrictive, use a fallback method
        // that's more conservative than before but still better than nothing
        if (contextualVideos.length === 0 && videos.length > 0) {
            console.log('Contextual filtering too restrictive, using secondary filtering');
            
            // Use a more restrictive fallback - only return high quality videos
            const highQualityVideos = videos.filter(video => 
                this.isHighQualityVideo(video.url) && 
                this.isMainContentVideo(video.url)
            );
            
            // Limit to a reasonable number of videos (max 15)
            return this.limitResults(highQualityVideos, 15);
        }
        
        // Limit final results to a reasonable number
        return this.limitResults(contextualVideos, 15);
    }
    
    // Extract video IDs from the page source
    extractVideoIdsFromContext(sourceCode) {
        const videoIds = new Set();
        
        // Pattern for video IDs in Facebook source
        const patterns = [
            /"video_id":"([0-9]+)"/g,
            /"videoId":"([0-9]+)"/g, 
            /"id":"([0-9]+)","is_video":true/g,
            /data-video-id="([0-9]+)"/g
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(sourceCode)) !== null) {
                if (match[1] && match[1].length > 5) {
                    videoIds.add(match[1]);
                }
            }
        });
        
        return videoIds;
    }
    
    // Extract a potential video ID from a URL
    extractVideoId(url) {
        // Try various patterns for video IDs in URLs
        const patterns = [
            /\/videos\/([0-9]+)/,
            /\/video_redirect\/\?video_id=([0-9]+)/,
            /video_id=([0-9]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }
    
    // More stringent check for main content videos (not previews)
    isMainContentVideo(url) {
        // These are characteristics of actual FB videos that open in new tab
        // Real videos have complete parameter sets that allow browser to open them
        return (
            // Must be high quality (real videos)
            (url.includes('/m412/') || url.includes('/m540/') || url.includes('/m366/')) &&
            
            // Must have proper FB video parameters (both forms)
            (url.includes('_nc_cat=') || url.includes('&_nc_cat=')) &&
            
            // Must have efg parameter (indicates proper video encoding)
            (url.includes('efg=') || url.includes('&efg=')) &&
            
            // Must have video hash/token (oh or _nc_ohc)
            (url.includes('oh=') || url.includes('_nc_ohc=')) &&
            
            // Must have host parameter
            (url.includes('_nc_ht=') || url.includes('&_nc_ht=')) &&
            
            // URL must be very long (typical for real FB videos)
            url.length > 350 &&
            
            // Must have proper video file structure (long hash before .mp4)
            /[A-Za-z0-9_-]{40,}\.mp4/.test(url) &&
            
            // Must not have preview/dash/segment indicators
            !url.includes('preview') &&
            !url.includes('thumb') &&
            !url.includes('dash') &&
            !url.includes('segment') &&
            !url.includes('manifest') &&
            !url.includes('init.mp4')
        );
    }
    
    // Limit results to a specified maximum number
    limitResults(videos, maxVideos) {
        if (videos.length <= maxVideos) {
            return videos;
        }
        
        // Sort by quality first
        videos.sort((a, b) => {
            const scoreA = this.getQualityScore(a.url);
            const scoreB = this.getQualityScore(b.url);
            return scoreB - scoreA;
        });
        
        // Return only the top videos
        return videos.slice(0, maxVideos);
    }

    // Extract video hash from URL for context matching
    extractVideoHash(url) {
        const match = url.match(/\/([A-Za-z0-9_-]{30,})\./);
        return match ? match[1] : '';
    }

    // More accurate content type analysis
    analyzeContentType(url) {
        // Facebook format codes analysis
        // m412 = High quality video with audio (720p-1080p)
        // m366 = Standard quality video with audio (360p-480p)  
        // m78 = Audio optimized version
        // m69 = Lower quality or segments
        
        const highQualityVideoAudio = /\/m(412|540|720|1080)/;
        const standardQualityVideoAudio = /\/m366/;
        const audioOptimized = /\/m78/;
        const lowerQuality = /\/m69/;
        
        if (highQualityVideoAudio.test(url)) {
            return {
                hasVideo: true,
                hasAudio: true,
                quality: 'high',
                description: 'High Quality Video + Audio'
            };
        }
        
        if (standardQualityVideoAudio.test(url)) {
            return {
                hasVideo: true,
                hasAudio: true,
                quality: 'standard',
                description: 'Standard Quality Video + Audio'
            };
        }
        
        if (audioOptimized.test(url)) {
            return {
                hasVideo: true,
                hasAudio: true,
                quality: 'audio-optimized',
                description: 'Audio Optimized Video'
            };
        }
        
        if (lowerQuality.test(url)) {
            // m69 might be video-only segments or lower quality
            return {
                hasVideo: true,
                hasAudio: false,
                quality: 'low',
                description: 'Video Only (Low Quality)'
            };
        }
        
        // Default for Facebook videos
        return {
            hasVideo: true,
            hasAudio: true,
            quality: 'unknown',
            description: 'Video + Audio'
        };
    }

    // Get quality score for sorting (higher is better)
    getQualityScore(url) {
        if (/\/m(412|540|720|1080)/.test(url)) return 100; // High quality
        if (/\/m366/.test(url)) return 80; // Standard quality
        if (/\/m78/.test(url)) return 60; // Audio optimized
        if (/\/m69/.test(url)) return 20; // Lower quality
        
        // Check for explicit quality indicators
        if (url.includes('1080') || url.includes('hd')) return 90;
        if (url.includes('720')) return 85;
        if (url.includes('480')) return 70;
        if (url.includes('360')) return 50;
        
        return 40; // Default
    }

    extractWithCheerio(html) {
        const videos = [];
        
        try {
            const $ = cheerio.load(html);
            
            // Look for video elements
            $('video').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src && this.isValidVideoUrl(src)) {
                    videos.push(this.createVideoObject(src));
                }
            });

            // Look for source elements within video tags
            $('video source').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src && this.isValidVideoUrl(src)) {
                    videos.push(this.createVideoObject(src));
                }
            });

            // Look for script tags containing video data
            $('script').each((i, elem) => {
                const content = $(elem).html();
                if (content && content.includes('video')) {
                    this.videoPatterns.forEach(pattern => {
                        let match;
                        const regex = new RegExp(pattern.source, pattern.flags);
                        
                        while ((match = regex.exec(content)) !== null) {
                            const url = this.decodeUrl(match[1]);
                            if (this.isValidVideoUrl(url)) {
                                videos.push(this.createVideoObject(url));
                            }
                        }
                    });
                }
            });

        } catch (error) {
            console.error('Cheerio extraction error:', error);
        }

        return videos;
    }

    extractFromStructuredData(html) {
        const videos = [];
        
        try {
            // Look for JSON-LD structured data
            const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
            let match;
            
            while ((match = jsonLdRegex.exec(html)) !== null) {
                try {
                    const jsonData = JSON.parse(match[1]);
                    const videoUrls = this.findVideoUrlsInObject(jsonData);
                    videoUrls.forEach(url => {
                        if (this.isValidVideoUrl(url)) {
                            videos.push(this.createVideoObject(url));
                        }
                    });
                } catch (error) {
                    // Invalid JSON, skip
                }
            }

        } catch (error) {
            console.error('Structured data extraction error:', error);
        }

        return videos;
    }

    findVideoUrlsInObject(obj, urls = []) {
        if (typeof obj !== 'object' || obj === null) return urls;
        
        for (const key in obj) {
            if (typeof obj[key] === 'string' && this.isValidVideoUrl(obj[key])) {
                urls.push(obj[key]);
            } else if (typeof obj[key] === 'object') {
                this.findVideoUrlsInObject(obj[key], urls);
            }
        }
        
        return urls;
    }

    fallbackVideoSearch(html, foundUrls, videos) {
        console.log('Starting fallback video search...');
        
        // Look for any URL that contains .mp4 with more flexible patterns
        const fallbackPatterns = [
            // Very broad .mp4 search
            /https?:\/\/[^\s"'<>]*\.mp4[^\s"'<>]*/gi,
            // Look for URLs with video indicators
            /https?:\/\/[^\s"'<>]*video[^\s"'<>]*\.mp4[^\s"'<>]*/gi,
            // Facebook CDN patterns
            /https?:\/\/[^\s"'<>]*scontent[^\s"'<>]*\.mp4[^\s"'<>]*/gi,
            /https?:\/\/[^\s"'<>]*fbcdn[^\s"'<>]*\.mp4[^\s"'<>]*/gi,
            // Look for any mention of video URLs in quotes
            /"(https?:\/\/[^"]*\.mp4[^"]*)"/gi,
            /'(https?:\/\/[^']*\.mp4[^']*)'/gi,
        ];
        
        fallbackPatterns.forEach((pattern, index) => {
            let match;
            let matchCount = 0;
            
            while ((match = pattern.exec(html)) !== null) {
                matchCount++;
                let url = match[1] || match[0];
                url = this.decodeUrl(url);
                
                console.log(`Fallback pattern ${index} found:`, url.substring(0, 200));
                
                if (this.isValidVideoUrl(url) && !foundUrls.has(url)) {
                    foundUrls.add(url);
                    videos.push(this.createVideoObject(url));
                    console.log('✅ Fallback found valid video:', url.substring(0, 150));
                }
            }
            
            if (matchCount > 0) {
                console.log(`Fallback pattern ${index} found ${matchCount} potential URLs`);
            }
        });
        
        console.log(`Fallback search complete. Total videos: ${videos.length}`);
    }

    sortVideosByQuality(videos) {
        const qualityOrder = { '4K': 0, '2K': 1, 'HD': 2, 'SD': 3, 'Low': 4, 'Unknown Quality': 5 };
        
        return videos.sort((a, b) => {
            const aOrder = qualityOrder[a.quality] || 5;
            const bOrder = qualityOrder[b.quality] || 5;
            return aOrder - bOrder;
        });
    }
}

// Initialize extractor
const extractor = new FacebookVideoExtractor();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/extract-videos', rateLimitMiddleware, async (req, res) => {
    try {
        const { sourceCode } = req.body;

        // Validation
        if (!sourceCode || typeof sourceCode !== 'string') {
            return res.status(400).json({
                error: 'Source code is required and must be a string.'
            });
        }

        if (sourceCode.length < 1000) {
            return res.status(400).json({
                error: 'Source code seems too short. Please provide the complete HTML source code.'
            });
        }

        if (sourceCode.length > 50 * 1024 * 1024) { // 50MB limit
            return res.status(400).json({
                error: 'Source code is too large. Please try with a smaller page.'
            });
        }

        // Basic HTML validation
        if (!sourceCode.includes('<html') && !sourceCode.includes('<!DOCTYPE')) {
            return res.status(400).json({
                error: 'The provided content does not appear to be valid HTML source code.'
            });
        }

        console.log(`Processing source code of length: ${sourceCode.length}`);

        // Extract videos
        const videos = extractor.extractVideos(sourceCode);

        // Filter to ensure these are actual Facebook video CDN URLs and not other media
        const facebookVideos = videos.filter(video => {
            // Check if the URL has Facebook-specific indicators
            const isFacebookVideo = video.url.includes('facebook.com') || 
                                   video.url.includes('fbcdn.net') || 
                                   video.url.includes('scontent') ||
                                   video.url.includes('fbvideo');
                                   
            // Also check if it has video format indicators that are typical for Facebook
            const hasVideoFormat = video.url.includes('.mp4') || video.url.includes('.m3u8');
            
            // Check for Facebook-specific URL structures (like video IDs, formats, etc.)
            const hasFacebookStructure = video.url.includes('?') && 
                                       (video.url.includes('dlid=') || 
                                        video.url.includes('format=') || 
                                        video.url.includes('quality=') ||
                                        video.url.includes('v/') ||
                                        video.url.includes('/v/') ||
                                        video.url.includes('/videos/'));
            
            // Accept if it's clearly a Facebook video URL
            return isFacebookVideo || hasFacebookStructure;
        });

        console.log(`Facebook video filtering: ${facebookVideos.length} videos from ${videos.length} total`);

        if (facebookVideos.length > 0) {
            console.log(`Found ${facebookVideos.length} Facebook video(s) after filtering`);

            res.json({
                success: true,
                videos: facebookVideos,
                count: facebookVideos.length,
                message: `Successfully extracted ${facebookVideos.length} Facebook video(s) from the page`,
                totalFound: videos.length,
                filteredCount: facebookVideos.length
            });
        } else {
            // If no Facebook videos found, try a more specific search for Facebook video patterns in the source
            console.log('No Facebook videos found with initial extraction, trying more specific patterns...');
            
            // Look for more specific Facebook video patterns in the HTML source
            const fbVideoPattern = /(?:"|')(https?:\/\/[^"']*scontent[^"']*\.mp4[^"']*)(?:"|')/gi;
            let match;
            const additionalUrls = new Set();
            
            while ((match = fbVideoPattern.exec(sourceCode)) !== null) {
                const url = extractor.decodeUrl(match[1]);
                if (extractor.isValidVideoUrl(url)) {
                    additionalUrls.add(url);
                }
            }
            
            if (additionalUrls.size > 0) {
                const additionalVideos = Array.from(additionalUrls).map(url => extractor.createVideoObject(url));
                console.log(`Found ${additionalVideos.length} additional Facebook videos via specific pattern matching`);
                
                return res.json({
                    success: true,
                    videos: additionalVideos,
                    count: additionalVideos.length,
                    message: `Found ${additionalVideos.length} Facebook video(s) using specific pattern matching`,
                    totalFound: videos.length,
                    filteredCount: additionalVideos.length
                });
            }

            // Final fallback - return a message indicating no Facebook videos found
            return res.json({
                success: true,
                videos: [],
                count: 0,
                message: `No Facebook videos found in the source code. This may be because the page doesn't contain a video, the video is not publicly accessible, or the video is embedded using a format we don't recognize.`,
                totalFound: videos.length,
                filteredCount: 0
            });
        }

    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({
            error: 'Failed to extract video links. Please try again or check if the source code is complete.',
            details: error.message
        });
    }
});

// Video proxy endpoint to handle CORS issues
app.get('/proxy-video', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }
        
        // Validate that it's a Facebook video URL
        if (!url.includes('fbcdn.net') && !url.includes('facebook.com')) {
            return res.status(400).json({ error: 'Only Facebook video URLs are allowed' });
        }
        
        // Set appropriate headers for video streaming
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.facebook.com/',
            'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
            'Accept-Encoding': 'identity',
            'Range': req.headers.range || 'bytes=0-'
        };
        
        // Import fetch dynamically
        const fetch = (await import('node-fetch')).default;
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Forward response headers
        res.set({
            'Content-Type': response.headers.get('content-type') || 'video/mp4',
            'Content-Length': response.headers.get('content-length'),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range'
        });
        
        if (response.headers.get('content-range')) {
            res.set('Content-Range', response.headers.get('content-range'));
            res.status(206);
        }
        
        // Stream the video
        response.body.pipe(res);
        
    } catch (error) {
        console.error('Video proxy error:', error);
        res.status(500).json({ error: 'Failed to proxy video' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test endpoint for debugging
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is working!',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /',
            'POST /extract-videos',
            'GET /health',
            'GET /test'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error occurred.'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found.'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Facebook Video Downloader server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} in your browser`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;