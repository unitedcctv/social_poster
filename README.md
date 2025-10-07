# Social Poster

A web application that allows you to create posts and share them on Mastodon, Bluesky, and LinkedIn social media platforms.

## Features

- **AI-Powered Post Suggestions with Web Research**: Get 3 AI-generated post suggestions based on any topic, with optional real-time web research for current, accurate content
- **Dual Content Fields**: Separate text areas for LinkedIn/Mastodon (500 chars) and Bluesky (300 chars) with AI auto-shortening
- **Automatic Image Compression**: Images are automatically compressed for Bluesky's 1MB limit while maintaining quality
- Create and format your posts
- Share to multiple platforms simultaneously (Mastodon, Bluesky, LinkedIn)
- Upload up to 4 images per post
- Hashtag suggestions and analytics
- Clean and responsive user interface
- Real-time feedback on post status

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later) or yarn
- Mastodon account (for Mastodon posting)
- Bluesky account (for Bluesky posting)

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd social-poster
```

### 2. Set up the backend

```bash
cd server
npm install
cp .env.example .env
```

Edit the `.env` file and add your API credentials:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
DEV_MODE=false

# Mastodon API Configuration
MASTODON_ACCESS_TOKEN=your_mastodon_access_token
MASTODON_API_URL=https://mastodon.social

# Bluesky API Configuration
BLUESKY_IDENTIFIER=your_bluesky_handle
BLUESKY_PASSWORD=your_bluesky_app_password

# LinkedIn API Configuration (optional)
LINKEDIN_ACCESS_TOKEN=your_linkedin_access_token
LINKEDIN_PERSON_URN=your_linkedin_person_urn

# OpenAI Configuration (for AI post suggestions)
OPENAI_API_KEY=your_openai_api_key

# Tavily API (optional - for web research in AI suggestions)
TAVILY_API_KEY=your_tavily_api_key
```

### 3. Set up the frontend

```bash
cd ../client
npm install
```

### 4. Start the development servers

In one terminal, start the backend:

```bash
cd server
npm run dev
```

In another terminal, start the frontend:

```bash
cd client
npm start
```

The application should now be running at `http://localhost:3000`.

## How to Get API Credentials

### Mastodon

1. Go to your Mastodon instance (e.g., mastodon.social)
2. Navigate to Preferences > Development > New Application
3. Give your app a name
4. Set the redirect URI to `urn:ietf:wg:oauth:2.0:oob`
5. Copy the access token and add it to your `.env` file

### Bluesky

1. Go to https://bsky.app/settings/app-passwords
2. Create a new app password
3. Use your handle (without @) as `BLUESKY_IDENTIFIER` (e.g., `username.bsky.social` or `yourdomain.com`) and the app password as `BLUESKY_PASSWORD` in your `.env` file

### LinkedIn (Optional)

1. Create a LinkedIn app at https://www.linkedin.com/developers/apps
2. Get your access token using OAuth 2.0 flow
3. Get your person URN from the LinkedIn API
4. Add both to your `.env` file

### OpenAI (For AI Suggestions)

1. Create an account at https://platform.openai.com/
2. Navigate to API keys section
3. Create a new API key
4. Add it as `OPENAI_API_KEY` in your `.env` file
5. Note: This feature requires API credits/billing to be set up in your OpenAI account

### Tavily Search API (Optional - For Web Research)

1. Sign up at https://tavily.com/
2. Get your free API key (1,000 searches/month on free tier)
3. Add it as `TAVILY_API_KEY` in your `.env` file
4. When configured, the AI will research your topic online before generating posts
5. This makes posts more current, accurate, and relevant with real-time information

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode.

### `npm test`

Launches the test runner.

### `npm run build`

Builds the app for production to the `build` folder.

## Deployment

### Frontend Deployment

Build the React app for production:

```bash
cd client
npm run build
```

### Backend Deployment

For production, you'll need to:

1. Set `NODE_ENV=production` in your `.env` file
2. Use a process manager like PM2
3. Set up a reverse proxy (Nginx, Apache, etc.)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


📊 Analytics & Insights
Post Performance Tracking: Views, likes, shares, comments per platform
Engagement Analytics Dashboard: Charts showing performance over time
Hashtag Performance: Track which hashtags perform best
Cross-Platform Comparison: Compare engagement between Mastodon/Bluesky
🎨 Content Enhancement
AI Content Suggestions: Generate post ideas based on trending topics
Image Filters/Editing: Basic image editing tools (crop, filters, text overlay)
GIF Support: Upload and post animated GIFs
Video Support: Short video uploads (with platform limits)
Link Preview Cards: Generate rich previews for shared links
🛠 Productivity Features
Draft System: Save posts as drafts for later
Template Library: Pre-made post templates for different content types
Bulk Upload: Upload multiple images at once with batch processing
Content Calendar: Visual calendar view of scheduled posts
Team Collaboration: Multiple user accounts with role permissions
🎯 Smart Features
Auto-Hashtag Generation: AI suggests hashtags based on image/text content
Character Optimization: Auto-adjust content length per platform limits
Cross-Post Customization: Different content versions per platform
Mention Suggestions: Auto-complete for @mentions
Trending Topics Integration: Show current trending hashtags/topics