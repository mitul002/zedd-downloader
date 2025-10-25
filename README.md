# Facebook Private Video Downloader

A web application that allows users to download private Facebook videos by extracting video URLs from the page source code. This tool works by parsing the HTML source code of Facebook pages to find embedded video URLs that are otherwise hidden.

## ⚠️ Important Legal Notice

**Please ensure you have permission to download the video content. Respect copyright laws and Facebook's terms of service. This tool is for educational purposes only.**

## 🌟 Features

- **Easy to Use**: Simple web interface with step-by-step instructions
- **No Browser Extensions**: Works entirely through web interface
- **Multiple Quality Support**: Automatically detects HD, SD, and other quality options
- **Private Video Support**: Extracts videos from private Facebook pages
- **Rate Limited**: Built-in protection against abuse
- **Responsive Design**: Works on desktop and mobile devices
- **Security Headers**: Includes security best practices

## 🚀 How It Works

1. **User opens a private Facebook video page**
2. **User views the page source code** (Right-click → View Page Source or Ctrl+U)
3. **User copies the entire HTML source code**
4. **User pastes the source code into our web app**
5. **Server parses the HTML to extract hidden video URLs**
6. **User gets download links for different quality formats**

## 📋 Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager
- Modern web browser

## 🛠️ Installation

### Local Development

1. **Clone or download the project files**
   ```bash
   # If you have git
   git clone <repository-url>
   cd facebook-video-downloader
   
   # Or download and extract the ZIP file
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   # For development
   npm run dev
   
   # For production
   npm start
   ```

4. **Open your browser**
   ```
   http://localhost:3000
   ```

### 🚀 Deploy to Render.com

This app is ready to deploy to Render.com with zero configuration changes needed.

#### Prerequisites
- A GitHub account
- A Render.com account (free tier available)
- Your code pushed to a GitHub repository

#### Step-by-Step Deployment

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/your-repo-name.git
   git push -u origin main
   ```

2. **Connect to Render**
   - Go to [render.com](https://render.com) and sign up/login
   - Click "New +" and select "Web Service"
   - Connect your GitHub account if not already connected
   - Select your repository

3. **Configure the service**
   - **Name**: `facebook-video-downloader` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install` (auto-detected)
   - **Start Command**: `npm start` (auto-detected)
   - **Plan**: Select "Free" for testing

4. **Environment Variables** (Optional)
   ```
   NODE_ENV = production
   ```

5. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy your app
   - You'll get a URL like: `https://your-app-name.onrender.com`

#### Alternative: Manual Render.yaml Deployment

The project includes a `render.yaml` file for advanced deployment configuration:

```yaml
services:
  - type: web
    name: facebook-video-downloader
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

To use this:
1. Push your code to GitHub
2. In Render dashboard, select "Infrastructure as Code"
3. Connect your repository
4. Render will use the `render.yaml` configuration automatically

#### Post-Deployment

- Your app will be available at the Render URL
- Free tier apps may sleep after 15 minutes of inactivity
- For production use, consider upgrading to a paid plan for 24/7 availability

#### Troubleshooting Render Deployment

**Build fails:**
- Check that `package.json` has all required dependencies
- Ensure Node.js version compatibility (14+ required)

**App crashes on startup:**
- Check Render logs for error messages
- Verify that the start command is correct: `npm start`
- Ensure `PORT` environment variable is used (already configured)

**Static files not loading:**
- The app serves static files from the root directory (already configured)
- Check that CSS/JS files are in the same directory as `server.js`

## 📦 Project Structure

```
facebook-video-downloader/
├── index.html          # Main HTML page
├── style.css           # Styling and responsive design
├── script.js           # Frontend JavaScript logic
├── server.js           # Backend Node.js server
├── package.json        # Project dependencies
└── README.md           # This file
```

## 🎯 Usage Instructions

### Step 1: Open Facebook Video
Navigate to the Facebook page containing the private video you want to download.

### Step 2: View Page Source
- **Method 1**: Right-click on the page and select "View Page Source"
- **Method 2**: Press `Ctrl+U` (Windows/Linux) or `Cmd+Option+U` (Mac)
- **Method 3**: Go to browser menu → Developer Tools → View Source

### Step 3: Copy Source Code
- Select all the HTML source code (`Ctrl+A`)
- Copy it to clipboard (`Ctrl+C`)

### Step 4: Extract Videos
- Paste the source code into the textarea on our web app
- Click "Extract Video Links"
- Download your preferred quality

## 🔧 Technical Details

### Backend Components

- **Express.js**: Web server framework
- **Cheerio**: Server-side HTML parsing
- **Rate Limiting**: Prevents abuse with configurable limits
- **Security Headers**: Helmet.js for security best practices
- **Compression**: Gzip compression for better performance

### Video Extraction Logic

The application uses multiple extraction methods:

1. **Regex Patterns**: Searches for common Facebook video URL patterns
2. **HTML Parsing**: Uses Cheerio to parse structured HTML elements
3. **JSON-LD Extraction**: Finds videos in structured data
4. **Quality Detection**: Automatically identifies video quality (HD, SD, etc.)

### Supported Video Patterns

- `hd_src` and `sd_src` URLs
- `playable_url` variations
- `browser_native` video URLs
- Progressive download URLs
- GraphQL video endpoints

## 🛡️ Security Features

- **Rate Limiting**: 10 requests per minute per IP address
- **Input Validation**: Validates HTML source code format
- **Size Limits**: 50MB maximum source code size
- **XSS Protection**: Content Security Policy headers
- **CORS Configuration**: Controlled cross-origin requests

## ⚙️ Configuration

### Environment Variables

```bash
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment mode
RATE_LIMIT_POINTS=10        # Requests per minute (default: 10)
RATE_LIMIT_DURATION=60      # Rate limit window in seconds
```

### Customization Options

You can modify these settings in `server.js`:

- **Rate limiting**: Adjust points and duration
- **File size limits**: Change the 50MB source code limit
- **Video patterns**: Add new regex patterns for video detection
- **Quality detection**: Modify quality classification logic

## 🐛 Troubleshooting

### Common Issues

**"No video links found"**
- Ensure you copied the complete HTML source code
- Make sure the Facebook page actually contains a video
- Try refreshing the Facebook page and copying source again

**"Source code too short"**
- The copied content should be several thousand characters
- Use Ctrl+A to select ALL source code, not just a portion

**"Invalid HTML source code"**
- Make sure you're copying from "View Page Source", not "Inspect Element"
- The source should start with `<!DOCTYPE html>` or `<html>`

**Rate limit errors**
- Wait 1 minute between requests
- The limit is 10 requests per minute per IP address

### Server Issues

**Port already in use**
```bash
# Change port in package.json or use environment variable
PORT=3001 npm start
```

**Dependencies issues**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📱 Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 🚦 Performance

- **Lightweight**: Minimal dependencies and optimized code
- **Fast Processing**: Efficient regex and parsing algorithms
- **Compression**: Gzip compression enabled for all responses
- **Caching**: Static files cached for better performance

## 🔒 Privacy & Data

- **No Data Storage**: Source code is not saved or logged
- **No User Tracking**: No analytics or user tracking implemented
- **Local Processing**: All extraction happens on your server
- **HTTPS Ready**: Supports SSL/TLS encryption

## 📝 Development

### Running in Development Mode

```bash
npm run dev
```

This uses nodemon for automatic server restart on file changes.

### Code Structure

- **Frontend**: Vanilla JavaScript (no frameworks)
- **Backend**: Node.js with Express
- **Parsing**: Cheerio for DOM manipulation
- **Security**: Helmet.js for security headers

### Adding New Video Patterns

To support new Facebook video URL formats, add patterns to the `videoPatterns` array in `server.js`:

```javascript
this.videoPatterns = [
    // Add new regex pattern here
    /"new_video_pattern":"([^"]+)"/g,
    // ... existing patterns
];
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚖️ Legal Disclaimer

This tool is provided for educational purposes only. Users are responsible for:

- Ensuring they have proper authorization to download content
- Complying with Facebook's Terms of Service
- Respecting copyright and intellectual property rights
- Following applicable local and international laws

The developers of this tool are not responsible for any misuse or legal consequences arising from its use.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Ensure you're using the latest version
3. Verify your Node.js version (14+ required)
4. Check the browser console for error messages

## 🔄 Updates

To update the application:

```bash
git pull origin main  # If using git
npm install          # Install any new dependencies
npm start           # Restart the server
```

---

**Remember**: Always respect content creators' rights and platform terms of service. Use this tool responsibly and ethically.