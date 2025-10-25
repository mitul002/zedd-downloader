// DOM Elements
const extractForm = document.getElementById('extractForm');
const sourceCodeTextarea = document.getElementById('sourceCode');
const extractBtn = document.getElementById('extractBtn');
const clearBtn = document.getElementById('clearBtn');
const charCount = document.getElementById('charCount');
const spinner = document.getElementById('spinner');
const results = document.getElementById('results');
const videoResults = document.getElementById('videoResults');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// Character counter
sourceCodeTextarea.addEventListener('input', function() {
    const count = this.value.length;
    charCount.textContent = `${count.toLocaleString()} characters`;
    
    // Update counter color based on content length
    if (count === 0) {
        charCount.style.color = '#64748b';
    } else if (count < 10000) {
        charCount.style.color = '#f59e0b';
    } else {
        charCount.style.color = '#10b981';
    }
});

// Clear button functionality
clearBtn.addEventListener('click', function() {
    sourceCodeTextarea.value = '';
    charCount.textContent = '0 characters';
    charCount.style.color = '#64748b';
    hideResults();
    hideError();
    sourceCodeTextarea.focus();
});

// Form submission handler
extractForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const sourceCode = sourceCodeTextarea.value.trim();
    
    if (!sourceCode) {
        showError('Please paste the Facebook page source code.');
        return;
    }
    
    if (sourceCode.length < 1000) {
        showError('The source code seems too short. Please make sure you copied the complete page source.');
        return;
    }
    
    await extractVideoLinks(sourceCode);
});

// Extract video links function
async function extractVideoLinks(sourceCode) {
    showLoading(true);
    hideError();
    hideResults();
    
    try {
        const response = await fetch('/extract-videos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sourceCode: sourceCode })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to extract video links');
        }
        
        if (data.videos && data.videos.length > 0) {
            displayResults(data.videos);
        } else {
            showError('No video links found in the provided source code. Please make sure the page contains a video and you copied the complete source code.');
        }
        
    } catch (error) {
        console.error('Extraction error:', error);
        showError(error.message || 'Failed to extract video links. Please check your internet connection and try again.');
    } finally {
        showLoading(false);
    }
}

// Display results function with grid layout
function displayResults(videos) {
    videoResults.innerHTML = '';
    
    // Add summary info
    if (videos.length > 0) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'results-summary';
        summaryDiv.innerHTML = `
            <div class="summary-stats">
                <h3><i class="fas fa-video"></i> Found ${videos.length} Videos with Audio & Video</h3>
                <p>All videos are filtered to include both audio and video tracks for the best viewing experience.</p>
            </div>
            <div class="view-controls">
                <button class="view-toggle-btn" id="viewToggleBtn">
                    <i class="fas fa-th"></i> Grid View
                </button>
            </div>
        `;
        videoResults.appendChild(summaryDiv);
    }
    
    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'video-grid';
    gridContainer.id = 'videoGrid';
    
    videos.forEach((video, index) => {
        const videoItem = createVideoItem(video, index);
        gridContainer.appendChild(videoItem);
    });
    
    videoResults.appendChild(gridContainer);
    
    results.style.display = 'block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Initialize video previews
    initializeVideoPreviews();
}

// Create video item element with grid layout and preview
function createVideoItem(video, index) {
    const videoDiv = document.createElement('div');
    videoDiv.className = 'video-grid-item';
    
    const qualityText = video.quality || 'Unknown Quality';
    const sizeText = video.size ? ` (${video.size})` : '';
    const typeText = video.type || 'MP4';
    const resolution = video.resolution || 'Auto';
    const contentType = video.contentType?.description || 'Video + Audio';
    
    videoDiv.innerHTML = `
        <div class="video-card">
            <div class="video-preview">
                <div class="video-thumbnail">
                    <video 
                        src="/proxy-video?url=${encodeURIComponent(video.url)}" 
                        muted 
                        preload="auto"
                        playsinline
                        class="preview-video"
                        data-video-url="${video.url}">
                    </video>
                    <div class="video-overlay">
                        <div class="play-button">
                            <i class="fas fa-play"></i>
                        </div>
                        <div class="video-loading" style="display: none;">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                    </div>
                    <div class="video-badges">
                        <span class="quality-badge">${qualityText}</span>
                        <span class="resolution-badge">${resolution}</span>
                    </div>
                </div>
            </div>
            
            <div class="video-details">
                <div class="video-title">
                    <h3>Facebook Video ${index + 1}</h3>
                    <p class="video-meta">
                        <i class="fas fa-video"></i> ${contentType}
                        <span class="separator">•</span>
                        <i class="fas fa-file-video"></i> ${typeText}
                        <span class="separator">•</span>
                        <i class="fas fa-hdd"></i> ${video.size}
                    </p>
                </div>
                
                <div class="video-actions">
                    <button class="preview-btn" data-video-url="${video.url}" data-video-title="Facebook Video ${index + 1}" data-video-quality="${qualityText}">
                        <i class="fas fa-play-circle"></i>
                        Play Video
                    </button>
                    <a href="${video.url}" 
                       class="download-btn primary" 
                       download="facebook-video-${qualityText}-${index + 1}.mp4"
                       target="_blank"
                       data-quality="${qualityText}">
                        <i class="fas fa-download"></i>
                        Download
                    </a>
                </div>
            </div>
        </div>
    `;
    
    return videoDiv;
}

// Show loading state
function showLoading(loading) {
    if (loading) {
        extractBtn.disabled = true;
        extractBtn.classList.add('loading');
        spinner.style.display = 'block';
        extractBtn.querySelector('span').style.opacity = '0';
    } else {
        extractBtn.disabled = false;
        extractBtn.classList.remove('loading');
        spinner.style.display = 'none';
        extractBtn.querySelector('span').style.opacity = '1';
    }
}

// Show error message
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Auto-hide error after 10 seconds
    setTimeout(hideError, 10000);
}

// Hide error message
function hideError() {
    errorMessage.style.display = 'none';
}

// Hide results
function hideResults() {
    results.style.display = 'none';
}

// Track download analytics (optional)
function trackDownload(quality) {
    try {
        console.log(`Download initiated: ${quality} quality video`);
        // You can add analytics tracking here if needed
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

// Auto-resize textarea
function autoResizeTextarea() {
    sourceCodeTextarea.style.height = 'auto';
    sourceCodeTextarea.style.height = Math.min(sourceCodeTextarea.scrollHeight, 500) + 'px';
}

sourceCodeTextarea.addEventListener('input', autoResizeTextarea);

// Paste event handler with validation
sourceCodeTextarea.addEventListener('paste', function(e) {
    setTimeout(function() {
        const content = sourceCodeTextarea.value;
        
        // Basic validation of pasted content
        if (content && !content.includes('<html') && !content.includes('<!DOCTYPE')) {
            showError('The pasted content doesn\'t appear to be valid HTML source code. Please make sure to copy the complete page source (Ctrl+U).');
        }
        
        autoResizeTextarea();
    }, 100);
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+Enter to submit form
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        extractForm.dispatchEvent(new Event('submit'));
    }
    
    // Escape to clear
    if (e.key === 'Escape') {
        if (sourceCodeTextarea.value) {
            clearBtn.click();
        }
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    sourceCodeTextarea.focus();
    
    // Add some helpful placeholder text after a delay
    setTimeout(function() {
        if (!sourceCodeTextarea.value) {
            sourceCodeTextarea.placeholder = `Paste the complete HTML source code here...

Example: Right-click on the Facebook page → "View Page Source" → Select All (Ctrl+A) → Copy (Ctrl+C) → Paste here (Ctrl+V)

The source code should start with something like:
<!DOCTYPE html>
<html lang="en">
...`;
        }
    }, 3000);
});

// Service worker registration for offline functionality (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registered: ', registration);
            })
            .catch(function(error) {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}

// Network status monitoring
window.addEventListener('online', function() {
    hideError();
});

window.addEventListener('offline', function() {
    showError('You are currently offline. Please check your internet connection.');
});

// Prevent form submission on Enter key in textarea
sourceCodeTextarea.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        // Allow normal Enter for line breaks
        return;
    }
});

// Copy to clipboard functionality for results
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        // Show success message
        const originalContent = event.target.innerHTML;
        event.target.innerHTML = '<i class="fas fa-check"></i> Copied!';
        event.target.style.background = '#10b981';
        
        setTimeout(function() {
            event.target.innerHTML = originalContent;
            event.target.style.background = '';
        }, 2000);
    }).catch(function(err) {
        console.error('Failed to copy: ', err);
    });
}

// Add copy buttons to video URLs (will be called when results are displayed)
function addCopyButtons() {
    const downloadBtns = document.querySelectorAll('.download-btn');
    downloadBtns.forEach(btn => {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy URL';
        copyBtn.onclick = function(e) {
            e.preventDefault();
            copyToClipboard(btn.href);
        };
        btn.parentNode.insertBefore(copyBtn, btn.nextSibling);
    });
}

// Enhanced error handling for different scenarios
function handleSpecificErrors(error) {
    if (error.message.includes('fetch')) {
        return 'Unable to connect to the server. Please check your internet connection and try again.';
    } else if (error.message.includes('timeout')) {
        return 'The request timed out. The source code might be too large or the server is busy. Please try again.';
    } else if (error.message.includes('parse')) {
        return 'Failed to parse the source code. Please make sure you copied the complete HTML source code.';
    } else if (error.message.includes('rate limit')) {
        return 'Too many requests. Please wait a moment before trying again.';
    }
    return error.message;
}

// Video preview functionality
// Open embedded video player
function openVideoPlayer(videoUrl, title, quality) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'video-player-modal';
    modal.innerHTML = `
        <div class="video-player-container">
            <div class="video-player-header">
                <div class="video-player-title">
                    <h3>${title}</h3>
                    <p class="video-player-quality">Quality: ${quality}</p>
                </div>
                <button class="close-player-btn" id="closePlayerBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="video-player-content">
                <video 
                    id="embeddedVideoPlayer"
                    controls 
                    autoplay 
                    preload="metadata"
                    class="embedded-video">
                    <source src="/proxy-video?url=${encodeURIComponent(videoUrl)}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
            <div class="video-player-actions">
                <button class="fullscreen-btn" id="fullscreenBtn">
                    <i class="fas fa-expand"></i> Fullscreen
                </button>
                <a href="${videoUrl}" 
                   class="download-btn primary" 
                   download="facebook-video-${quality}.mp4"
                   target="_blank">
                    <i class="fas fa-download"></i>
                    Download Video
                </a>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeVideoPlayer();
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeVideoPlayer();
        }
    });
}

// Close video player modal
function closeVideoPlayer() {
    const modal = document.querySelector('.video-player-modal');
    if (modal) {
        const video = modal.querySelector('#embeddedVideoPlayer');
        if (video) {
            video.pause();
        }
        modal.remove();
    }
}

// Toggle fullscreen mode
function toggleFullscreen() {
    const video = document.getElementById('embeddedVideoPlayer');
    if (video) {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) {
            video.msRequestFullscreen();
        }
    }
}

// Initialize video previews
function initializeVideoPreviews() {
    const previewVideos = document.querySelectorAll('.preview-video');
    
    previewVideos.forEach(video => {
        // Set up video for proper preview
        video.addEventListener('loadstart', function() {
            console.log('Video loading started:', this.src.substring(0, 50) + '...');
        });
        
        video.addEventListener('loadedmetadata', function() {
            console.log('Video metadata loaded, duration:', this.duration);
            // Jump to 2 seconds for better preview frame
            if (this.duration > 2) {
                this.currentTime = 2;
            }
        });
        
        video.addEventListener('loadeddata', function() {
            console.log('Video data loaded successfully');
            // Auto-play a short preview
            this.currentTime = 2;
        });
        
        video.addEventListener('canplay', function() {
            console.log('Video can start playing');
            // Show video, hide loading
            this.style.opacity = '1';
        });
        
        video.addEventListener('error', function(e) {
            console.error('Video loading error:', e);
            console.error('Error details:', this.error);
            // Fallback: show play button overlay
            const overlay = this.nextElementSibling;
            if (overlay && overlay.classList.contains('video-overlay')) {
                overlay.style.display = 'flex';
            }
        });
        
        // Click handler for play/pause - using the popup player instead
        video.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Get video data for the popup player
            const videoUrl = this.dataset.videoUrl;
            const videoCard = this.closest('.video-grid-item');
            const previewBtn = videoCard.querySelector('.preview-btn');
            const videoTitle = previewBtn.dataset.videoTitle;
            const videoQuality = previewBtn.dataset.videoQuality;
            
            if (videoUrl && videoTitle && videoQuality) {
                openVideoPlayer(videoUrl, videoTitle, videoQuality);
            }
        });
        
        // Handle play/pause events
        video.addEventListener('play', function() {
            const overlay = this.nextElementSibling;
            if (overlay) overlay.style.display = 'none';
        });
        
        video.addEventListener('pause', function() {
            const overlay = this.nextElementSibling;
            if (overlay) overlay.style.display = 'flex';
        });
        
        video.addEventListener('ended', function() {
            // Reset to preview frame when video ends
            this.currentTime = 2;
            const overlay = this.nextElementSibling;
            if (overlay) overlay.style.display = 'flex';
        });
        
        // Try to load the video
        video.load();
    });
}

// Toggle between grid and list view
let currentViewMode = 'grid';
function toggleViewMode() {
    const videoGrid = document.getElementById('videoGrid');
    const toggleBtn = document.getElementById('viewToggleBtn');
    
    if (currentViewMode === 'grid') {
        videoGrid.className = 'video-list';
        toggleBtn.innerHTML = '<i class="fas fa-th-list"></i> List View';
        currentViewMode = 'list';
    } else {
        videoGrid.className = 'video-grid';
        toggleBtn.innerHTML = '<i class="fas fa-th"></i> Grid View';
        currentViewMode = 'grid';
    }
}

// Initialize all event listeners
function initializeEventListeners() {
    // View toggle button
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', toggleViewMode);
    }
    
    // Add event listeners for dynamically created elements
    document.addEventListener('click', function(e) {
        // Preview/Play video buttons
        if (e.target.closest('.preview-btn')) {
            const btn = e.target.closest('.preview-btn');
            const videoUrl = btn.dataset.videoUrl;
            const videoTitle = btn.dataset.videoTitle;
            const videoQuality = btn.dataset.videoQuality;
            
            if (videoUrl && videoTitle && videoQuality) {
                openVideoPlayer(videoUrl, videoTitle, videoQuality);
            }
        }
        
        // Play button overlay in thumbnails
        if (e.target.closest('.play-button') || e.target.closest('.video-overlay')) {
            const videoElement = e.target.closest('.video-thumbnail').querySelector('.preview-video');
            if (videoElement) {
                const videoUrl = videoElement.dataset.videoUrl;
                const videoCard = e.target.closest('.video-grid-item');
                const previewBtn = videoCard.querySelector('.preview-btn');
                const videoTitle = previewBtn.dataset.videoTitle;
                const videoQuality = previewBtn.dataset.videoQuality;
                
                if (videoUrl && videoTitle && videoQuality) {
                    openVideoPlayer(videoUrl, videoTitle, videoQuality);
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        }
        
        // Download buttons
        if (e.target.closest('.download-btn')) {
            const btn = e.target.closest('.download-btn');
            const quality = btn.dataset.quality;
            if (quality) {
                trackDownload(quality);
            }
        }
        
        // Close player button
        if (e.target.closest('#closePlayerBtn')) {
            closeVideoPlayer();
        }
        
        // Fullscreen button
        if (e.target.closest('#fullscreenBtn')) {
            toggleFullscreen();
        }
    });
}

// Initialize downloader selection (switch between facebook/youtube/instagram/x sections)
function initializeDownloaderSelection() {
    const cards = document.querySelectorAll('.downloader-card');
    const forms = document.querySelectorAll('.downloader-form');

    if (!cards.length || !forms.length) return;

    function showForm(name) {
        forms.forEach(f => {
            if (f.id === `${name}-downloader`) {
                f.classList.add('active');
            } else {
                f.classList.remove('active');
            }
        });
    }

    cards.forEach(card => {
        card.addEventListener('click', function() {
            // update active card
            cards.forEach(c => c.classList.remove('active'));
            this.classList.add('active');

            const target = this.dataset.downloader;
            if (target) showForm(target);
        });
    });

    // show initial active card's form
    const initial = document.querySelector('.downloader-card.active');
    if (initial && initial.dataset.downloader) {
        showForm(initial.dataset.downloader);
    } else if (cards[0] && cards[0].dataset.downloader) {
        // fallback: show first
        showForm(cards[0].dataset.downloader);
    }
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeDownloaderSelection();
});