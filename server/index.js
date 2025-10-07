require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');
const Mastodon = require('mastodon-api');
const { BskyAgent } = require('@atproto/api');
const OpenAI = require('openai');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 4 // Max 4 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Initialize Mastodon client
let mastodonClient = null;
if (process.env.MASTODON_ACCESS_TOKEN && process.env.MASTODON_API_URL) {
  mastodonClient = new Mastodon({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: process.env.MASTODON_API_URL,
  });
}

// Initialize Bluesky agent
const blueskyAgent = new BskyAgent({
  service: 'https://bsky.social'
});

// Initialize OpenAI client
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Helper function to parse hashtags from content
function parseHashtags(content) {
  const hashtagRegex = /#[\w]+/g;
  return content.match(hashtagRegex) || [];
}

// Helper function to validate hashtag format
function validateHashtags(hashtags) {
  const validHashtagRegex = /^#[a-zA-Z0-9_]+$/;
  const results = {
    valid: [],
    invalid: [],
    warnings: []
  };

  hashtags.forEach(tag => {
    if (validHashtagRegex.test(tag)) {
      if (tag.length > 100) {
        results.warnings.push(`${tag} is very long (${tag.length} chars)`);
      }
      results.valid.push(tag);
    } else {
      results.invalid.push(tag);
    }
  });

  return results;
}

// Helper function to get hashtag analytics
function getHashtagAnalytics(content, hashtags) {
  return {
    total_hashtags: hashtags.length,
    hashtags: hashtags,
    hashtag_density: hashtags.length / (content.split(' ').length || 1),
    character_count_with_hashtags: hashtags.join('').length,
    most_common_prefix: hashtags.length > 0 ? getMostCommonPrefix(hashtags) : null,
    suggestions: getSuggestedHashtags(content, hashtags)
  };
}

function getMostCommonPrefix(hashtags) {
  if (hashtags.length === 0) return null;
  
  const prefixes = hashtags.map(tag => tag.substring(0, 4));
  const prefixCount = {};
  
  prefixes.forEach(prefix => {
    prefixCount[prefix] = (prefixCount[prefix] || 0) + 1;
  });
  
  return Object.keys(prefixCount).reduce((a, b) => 
    prefixCount[a] > prefixCount[b] ? a : b
  );
}

function getSuggestedHashtags(content, existingHashtags) {
  const suggestions = [];
  const words = content.toLowerCase().split(/\s+/);
  
  // Simple keyword-based suggestions
  const keywordMap = {
    'social': '#socialmedia',
    'tech': '#technology',
    'code': '#coding',
    'design': '#design',
    'business': '#business',
    'startup': '#startup',
    'ai': '#artificialintelligence',
    'photo': '#photography',
    'art': '#art',
    'music': '#music'
  };
  
  words.forEach(word => {
    if (keywordMap[word] && !existingHashtags.includes(keywordMap[word])) {
      suggestions.push(keywordMap[word]);
    }
  });
  
  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

// Helper function to upload media to LinkedIn
async function uploadLinkedInMedia(imagePath) {
  if (!process.env.LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn credentials not configured');
  }

  try {
    // First, register the upload
    const registerResponse = await axios.post(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      {
        initializeUploadRequest: {
          owner: process.env.LINKEDIN_PERSON_URN
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202408',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const uploadUrl = registerResponse.data.value.uploadUrl;
    const imageUrn = registerResponse.data.value.image;

    // Upload the image
    const imageData = fs.readFileSync(imagePath);
    await axios.put(uploadUrl, imageData, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });

    return imageUrn;
  } catch (error) {
    console.error('LinkedIn media upload error:', error.response?.data || error.message);
    throw error;
  }
}

// Helper function to post to LinkedIn
async function postToLinkedIn(content, images = []) {
  if (!process.env.LINKEDIN_ACCESS_TOKEN || !process.env.LINKEDIN_PERSON_URN) {
    return {
      platform: 'linkedin',
      success: false,
      message: 'LinkedIn credentials not configured'
    };
  }

  try {
    let postData = {
      author: process.env.LINKEDIN_PERSON_URN,
      commentary: content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    };

    // Handle images if provided
    if (images.length > 0) {
      const imageUrns = [];
      for (const image of images) {
        const imageUrn = await uploadLinkedInMedia(image.path);
        imageUrns.push(imageUrn);
      }

      if (imageUrns.length === 1) {
        // Single image post
        postData.content = {
          media: {
            id: imageUrns[0]
          }
        };
      } else {
        // Multiple images post
        postData.content = {
          multiImage: {
            images: imageUrns.map(urn => ({ id: urn }))
          }
        };
      }
    }

    const response = await axios.post(
      'https://api.linkedin.com/rest/posts',
      postData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202408',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    return {
      platform: 'linkedin',
      success: true,
      message: `Successfully posted to LinkedIn${images.length > 0 ? ` with ${images.length} image(s)` : ''}`,
      postId: response.headers['x-restli-id']
    };
  } catch (error) {
    console.error('LinkedIn posting error:', error.response?.data || error.message);
    return {
      platform: 'linkedin',
      success: false,
      message: `LinkedIn error: ${error.response?.data?.message || error.message}`
    };
  }
}

// Helper function to upload media to Mastodon using direct API call
async function uploadMastodonMediaDirect(imagePath) {
  if (!process.env.MASTODON_ACCESS_TOKEN || !process.env.MASTODON_API_URL) {
    throw new Error('Mastodon credentials not configured');
  }

  try {
    // First, let's test basic API connectivity
    console.log('Testing Mastodon API connectivity...');
    try {
      const testResponse = await axios.get(`${process.env.MASTODON_API_URL}/api/v1/instance`, {
        headers: {
          'Authorization': `Bearer ${process.env.MASTODON_ACCESS_TOKEN}`
        }
      });
      console.log('API connectivity test successful. Instance info:', {
        title: testResponse.data.title,
        version: testResponse.data.version,
        uri: testResponse.data.uri
      });
    } catch (testError) {
      console.log('API connectivity test failed:', {
        message: testError.message,
        status: testError.response?.status,
        statusText: testError.response?.statusText
      });
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    
    console.log('Uploading media to Mastodon (direct API):', imagePath);
    console.log('Mastodon API URL:', process.env.MASTODON_API_URL);
    console.log('Using access token:', process.env.MASTODON_ACCESS_TOKEN ? 'Yes (length: ' + process.env.MASTODON_ACCESS_TOKEN.length + ')' : 'No');
    
    // Try v2 endpoint first, then fallback to v1
    let response;
    try {
      const v2Url = `${process.env.MASTODON_API_URL}/api/v2/media`;
      console.log('Trying v2 endpoint:', v2Url);
      
      response = await axios.post(
        v2Url,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${process.env.MASTODON_ACCESS_TOKEN}`,
            ...formData.getHeaders()
          }
        }
      );
      console.log('Mastodon v2 media upload response:', {
        status: response.status,
        data: response.data
      });
    } catch (v2Error) {
      console.log('v2 endpoint failed, trying v1:', v2Error.response?.status);
      console.log('v2 error details:', {
        message: v2Error.message,
        status: v2Error.response?.status,
        statusText: v2Error.response?.statusText,
        headers: v2Error.response?.headers
      });
      
      // Try v1 endpoint as fallback
      const formDataV1 = new FormData();
      formDataV1.append('file', fs.createReadStream(imagePath));
      
      const v1Url = `${process.env.MASTODON_API_URL}/api/v1/media`;
      console.log('Trying v1 endpoint:', v1Url);
      
      response = await axios.post(
        v1Url,
        formDataV1,
        {
          headers: {
            'Authorization': `Bearer ${process.env.MASTODON_ACCESS_TOKEN}`,
            ...formDataV1.getHeaders()
          }
        }
      );
      console.log('Mastodon v1 media upload response:', {
        status: response.status,
        data: response.data
      });
    }
    
    if (!response.data || !response.data.id) {
      throw new Error('Media upload failed - no ID returned');
    }
    
    // Check if media needs processing (some Mastodon instances require this)
    if (response.data.url === null && response.data.preview_url) {
      console.log('Media is still processing, waiting...');
      // Wait a bit for processing (most media processes quickly)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Media upload successful, ID:', response.data.id, 'URL:', response.data.url);
    return response.data.id;
  } catch (error) {
    console.error('Mastodon direct media upload error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
}

// Helper function to upload media to Mastodon
async function uploadMastodonMedia(imagePath) {
  if (!mastodonClient) {
    throw new Error('Mastodon credentials not configured');
  }

  try {
    // Try direct API call first
    return await uploadMastodonMediaDirect(imagePath);
  } catch (directError) {
    console.log('Direct API upload failed, trying mastodon-api package:', directError.message);
    
    try {
      // For mastodon-api package, we need to pass the file differently
      console.log('Uploading media to Mastodon (mastodon-api package):', imagePath);
      
      // Check if file exists and is readable
      if (!fs.existsSync(imagePath)) {
        throw new Error(`File does not exist: ${imagePath}`);
      }
      
      const fileStats = fs.statSync(imagePath);
      console.log('File stats:', { size: fileStats.size, path: imagePath });
      
      // Use the mastodon-api package's built-in media upload
      const response = await mastodonClient.post('media', {
        file: fs.createReadStream(imagePath)
      });
      
      console.log('Mastodon media upload response (mastodon-api):', {
        status: response.resp?.statusCode,
        data: response.data
      });
      
      // Check if the response contains the media ID
      if (!response.data || !response.data.id) {
        console.error('Invalid media upload response:', response.data);
        throw new Error('Media upload failed - no ID returned');
      }
      
      return response.data.id;
    } catch (error) {
      console.error('Mastodon media upload error (mastodon-api):', {
        message: error.message,
        statusCode: error.statusCode,
        response: error.response?.data || error.response
      });
      throw error;
    }
  }
}

// Helper function to post to Mastodon
async function postToMastodon(content, images = []) {

  if (!mastodonClient) {
    throw new Error('Mastodon credentials not configured');
  }

  if (process.env.DEV_MODE === 'true') {
    return {
      platform: 'mastodon',
      success: true,
      message: `DEV MODE - ${content}`,
      devInfo: {
        network: 'Mastodon',
        credentials: {
          access_token: process.env.MASTODON_ACCESS_TOKEN,
          api_url: process.env.MASTODON_API_URL
        },
        content: content,
        images: images.map(img => ({ filename: img.originalname, size: img.size }))
      }
    };
  }
  
  try {
    let mediaIds = [];
    
    // Upload images if provided
    if (images && images.length > 0) {
      console.log(`Attempting to upload ${images.length} images to Mastodon`);
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          console.log(`Uploading image ${i + 1}/${images.length}:`, {
            path: image.path,
            originalname: image.originalname,
            mimetype: image.mimetype,
            size: image.size
          });
          const mediaId = await uploadMastodonMedia(image.path);
          console.log(`Successfully uploaded image ${i + 1}, media ID:`, mediaId, 'type:', typeof mediaId);
          // Ensure media ID is a string
          mediaIds.push(String(mediaId));
        } catch (uploadError) {
          console.error(`Failed to upload image ${i + 1}:`, uploadError);
          // Continue with other images, don't fail the entire post
        }
      }
      console.log('Final media IDs for Mastodon post:', mediaIds);
    }
    
    const postData = { status: content };
    if (mediaIds.length > 0) {
      postData.media_ids = mediaIds;
    }
    
    console.log('Creating Mastodon post with data:', postData);
    
    // Try direct API call for posting status to ensure consistency
    let response;
    try {
      response = await axios.post(
        `${process.env.MASTODON_API_URL}/api/v1/statuses`,
        postData,
        {
          headers: {
            'Authorization': `Bearer ${process.env.MASTODON_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Mastodon post response (direct API):', {
        status: response.status,
        data: response.data
      });
    } catch (directError) {
      console.log('Direct API post failed, trying mastodon-api package:', directError.message);
      response = await mastodonClient.post('statuses', postData);
      console.log('Mastodon post response (mastodon-api):', {
        status: response.resp?.statusCode,
        data: response.data
      });
    }
    
    // Check if there's an error in the response data
    if (response.data && response.data.error) {
      return {
        platform: 'mastodon',
        success: false,
        message: `Mastodon error: ${response.data.error}`
      };
    }
    
    // Check HTTP status code (handle both direct API and mastodon-api package responses)
    const statusCode = response.status || (response.resp && response.resp.statusCode);
    if (statusCode >= 400) {
      return {
        platform: 'mastodon',
        success: false,
        message: `Mastodon HTTP error: ${statusCode}`
      };
    }
    
    return {
      platform: 'mastodon',
      success: true,
      message: `Successfully posted to Mastodon${images.length > 0 ? ` with ${images.length} image(s)` : ''}`,
      url: response.data.url,
      postId: response.data.id
    };
  } catch (error) {
    console.error('Mastodon posting error:', error);
    console.error('Error details:', {
      message: error.message,
      statusCode: error.statusCode,
      response: error.response
    });
    
    return {
      platform: 'mastodon',
      success: false,
      message: `Mastodon error: ${error.message}`
    };
  }
}

// Helper function to compress image for Bluesky (max ~900KB to stay under 1MB limit)
async function compressImageForBluesky(imagePath) {
  const MAX_SIZE = 900 * 1024; // 900KB target
  const outputPath = `${imagePath}_compressed.jpg`;
  
  try {
    // Get original image metadata
    const metadata = await sharp(imagePath).metadata();
    
    // Start with quality 85
    let quality = 85;
    let compressed = false;
    
    // Try compression with decreasing quality until under MAX_SIZE
    while (quality > 20 && !compressed) {
      await sharp(imagePath)
        .resize(2048, 2048, { // Max dimension 2048px
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality, mozjpeg: true })
        .toFile(outputPath);
      
      const stats = fs.statSync(outputPath);
      
      if (stats.size <= MAX_SIZE) {
        compressed = true;
        console.log(`Compressed image from ${metadata.size} to ${stats.size} bytes (quality: ${quality})`);
      } else {
        quality -= 10;
      }
    }
    
    return outputPath;
  } catch (error) {
    console.error('Image compression error:', error);
    // Return original if compression fails
    return imagePath;
  }
}

// Helper function to upload media to Bluesky
async function uploadBlueskyMedia(imagePath) {
  try {
    // Compress image first for Bluesky's size limits
    const compressedPath = await compressImageForBluesky(imagePath);
    
    const imageData = fs.readFileSync(compressedPath);
    const mimeType = 'image/jpeg'; // Always JPEG after compression
    
    const response = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'Authorization': `Bearer ${blueskyAgent.session?.accessJwt}`,
      },
      body: imageData,
    });

    if (!response.ok) {
      throw new Error(`Bluesky media upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Clean up compressed file if it's different from original
    if (compressedPath !== imagePath) {
      try {
        fs.unlinkSync(compressedPath);
      } catch (cleanupError) {
        console.error('Failed to cleanup compressed file:', cleanupError);
      }
    }
    
    return result.blob;
  } catch (error) {
    console.error('Bluesky media upload error:', error);
    throw error;
  }
}

// Helper function to post to Bluesky
async function postToBluesky(content, images = []) {

  if (!process.env.BLUESKY_IDENTIFIER || !process.env.BLUESKY_PASSWORD) {
    throw new Error('Bluesky credentials not configured');
  }

  if (process.env.DEV_MODE === 'true') {
    return {
      platform: 'bluesky',
      success: true,
      message: `DEV MODE - ${content}`,
      devInfo: {
        network: 'Bluesky',
        credentials: {
          identifier: process.env.BLUESKY_IDENTIFIER,
          password: process.env.BLUESKY_PASSWORD
        },
        content: content,
        images: images.map(img => ({ filename: img.originalname, size: img.size }))
      }
    };
  }
  
  try {
    // Login to Bluesky
    await blueskyAgent.login({
      identifier: process.env.BLUESKY_IDENTIFIER,
      password: process.env.BLUESKY_PASSWORD,
    });
    
    let embed = null;
    
    // Upload images if provided
    if (images && images.length > 0) {
      const imageBlobs = [];
      
      for (const image of images) {
        try {
          const blob = await uploadBlueskyMedia(image.path);
          imageBlobs.push({
            alt: '', // Empty alt text for now
            image: blob,
          });
        } catch (uploadError) {
          console.error('Failed to upload image to Bluesky:', uploadError);
          // Continue with other images
        }
      }
      
      if (imageBlobs.length > 0) {
        embed = {
          $type: 'app.bsky.embed.images',
          images: imageBlobs,
        };
      }
    }
    
    // Create the post
    const postData = {
      text: content,
      createdAt: new Date().toISOString(),
    };
    
    if (embed) {
      postData.embed = embed;
    }
    
    const response = await blueskyAgent.post(postData);
    
    return {
      platform: 'bluesky',
      success: true,
      message: `Successfully posted to Bluesky${images.length > 0 ? ` with ${images.length} image(s)` : ''}`,
      uri: response.uri
    };
  } catch (error) {
    console.error('Bluesky posting error:', error);
    return {
      platform: 'bluesky',
      success: false,
      message: `Bluesky error: ${error.message}`
    };
  }
}

// API Routes
app.post('/api/posts', upload.array('images', 4), async (req, res) => {
  const { content, blueskyContent, platforms } = req.body;
  const images = req.files || [];
  
  if (!content || !content.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Post content is required' 
    });
  }
  
  // Parse platforms if it's a string (from FormData)
  let selectedPlatforms;
  try {
    selectedPlatforms = typeof platforms === 'string' ? JSON.parse(platforms) : platforms;
  } catch (e) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid platforms format' 
    });
  }

  if (!selectedPlatforms || selectedPlatforms.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'At least one platform must be selected' 
    });
  }
  
  try {
    const results = [];
    const postPromises = [];
    
    // Use blueskyContent if provided, otherwise use main content
    const blueskyText = blueskyContent && blueskyContent.trim() ? blueskyContent : content;
    
    // Parse and validate hashtags
    const hashtags = parseHashtags(content);
    const hashtagValidation = validateHashtags(hashtags);
    const hashtagAnalytics = getHashtagAnalytics(content, hashtags);
    
    // Post to selected platforms
    if (selectedPlatforms.includes('mastodon')) {
      postPromises.push(postToMastodon(content, images));
    }
    
    if (selectedPlatforms.includes('bluesky')) {
      postPromises.push(postToBluesky(blueskyText, images));
    }
    
    if (selectedPlatforms.includes('linkedin')) {
      postPromises.push(postToLinkedIn(content, images));
    }
    
    // Wait for all posts to complete
    const postResults = await Promise.allSettled(postPromises);
    
    // Process results
    postResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          platform: 'unknown',
          success: false,
          message: `Error: ${result.reason.message}`
        });
      }
    });
    
    // Check if any posts succeeded
    const hasSuccess = results.some(r => r.success);
    const hasFailure = results.some(r => !r.success);
    
    // Add hashtag analytics to dev mode responses
    const responseData = { 
      success: hasSuccess, 
      results: results.map(result => {
        if (process.env.DEV_MODE === 'true' && result.success) {
          return {
            ...result,
            hashtag_analytics: hashtagAnalytics,
            hashtag_validation: hashtagValidation
          };
        }
        return result;
      }),
      partial: hasSuccess && hasFailure
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error posting to social media:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    // Clean up uploaded files
    if (images && images.length > 0) {
      images.forEach(image => {
        try {
          fs.unlinkSync(image.path);
        } catch (cleanupError) {
          console.error('Failed to cleanup uploaded file:', cleanupError);
        }
      });
    }
  }
});

// API endpoint to shorten post for Bluesky
app.post('/api/shorten-for-bluesky', express.json(), async (req, res) => {
  const { content } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Content is required' 
    });
  }
  
  if (!openaiClient) {
    return res.status(503).json({ 
      success: false, 
      error: 'AI service not configured. Please add OPENAI_API_KEY to your .env file.' 
    });
  }
  
  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at condensing social media posts for Bluesky. ABSOLUTE REQUIREMENT: Output must be MAXIMUM 270 characters INCLUDING every single space, punctuation mark, and hashtag. If you go over 270 characters, the post will FAIL. Preserve core message, include 1-2 hashtags max. Natural, engaging tone. British English. Triple-check character count before responding.'
        },
        {
          role: 'user',
          content: `Condense this to MAXIMUM 270 characters (not 280, not 300 - exactly 270 or less):\n\n${content}\n\nCRITICAL: Count every character. 270 is the absolute maximum. Shorten aggressively if needed.`
        }
      ],
      temperature: 0.3,
      max_tokens: 100
    });
    
    let shortenedContent = completion.choices[0].message.content.trim();
    
    // Safety check: if still over 280, aggressively truncate without ellipsis
    if (shortenedContent.length > 280) {
      // Find last complete word before 280 chars
      shortenedContent = shortenedContent.substring(0, 280);
      const lastSpace = shortenedContent.lastIndexOf(' ');
      if (lastSpace > 250) {
        shortenedContent = shortenedContent.substring(0, lastSpace);
      }
    }
    
    // Final safety: ensure absolutely under 300
    if (shortenedContent.length > 300) {
      shortenedContent = shortenedContent.substring(0, 300);
    }
    
    res.json({
      success: true,
      content: shortenedContent,
      length: shortenedContent.length
    });
  } catch (error) {
    console.error('OpenAI shorten error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to shorten content' 
    });
  }
});

// API endpoint to generate post suggestions
app.post('/api/suggest-posts', express.json(), async (req, res) => {
  const { topic } = req.body;
  
  if (!topic || !topic.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Topic is required' 
    });
  }
  
  if (!openaiClient) {
    return res.status(503).json({ 
      success: false, 
      error: 'AI service not configured. Please add OPENAI_API_KEY to your .env file.' 
    });
  }
  
  try {
    // First, do a quick web search to get current info
    let searchContext = '';
    let searchStatus = {
      enabled: !!process.env.TAVILY_API_KEY,
      success: false,
      message: ''
    };
    
    if (process.env.TAVILY_API_KEY) {
      try {
        const searchResponse = await axios.post('https://api.tavily.com/search', {
          api_key: process.env.TAVILY_API_KEY,
          query: topic,
          search_depth: 'basic',
          max_results: 3
        });
        
        if (searchResponse.data && searchResponse.data.results) {
          const searchResults = searchResponse.data.results
            .map(r => `${r.title}: ${r.content}`)
            .join('\n');
          searchContext = `\n\nRecent web research about "${topic}":\n${searchResults}`;
          searchStatus.success = true;
          searchStatus.message = `Found ${searchResponse.data.results.length} web sources`;
        }
      } catch (searchError) {
        console.log('Web search failed, continuing without it:', searchError.message);
        searchStatus.message = `Web search failed: ${searchError.message}`;
      }
    } else {
      searchStatus.message = 'Web research disabled (Tavily API key not configured)';
    }

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: [
            "You are a creative social media expert for Mastodon, Bluesky, and LinkedIn.",
            "Generate 3 distinct post variations, each ≤500 characters INCLUDING spaces.",
            "Angle: factual, informative and inspirational/emotional",
            "Tone: authentic, human, no corporate speak, no clickbait.",
            "Hashtags: 2–4, relevant and strategic, placed at the end. No hashtag stuffing.",
            "Variation: do NOT reuse the same first 5 words, verbs, or structure across posts.",
            "Facts & recency: if `searchContext` is provided, ONLY use facts from it; do not invent numbers, dates, or quotes.",
            "If you use a fact from `searchContext`, add an attribution/link in parentheses like (source: example.com).",
            "Style: concise, readable, do not include emojis; avoid over-formatting.",
            "British English."
          ].join(" ")
        },
        {
          role: 'user',
          content: `Create 3 compelling social posts about: "${topic}". ${
            searchContext
              ? 'Base any time-sensitive or factual claims ONLY on this recent web research:\n' + searchContext
              : 'Use general knowledge without inventing specific statistics or dates.'
          }\n\nNumber them 1, 2, 3. Separate with a blank line. Each must be ≤500 characters INCLUDING spaces. If any exceeds the limit, shorten it.`
        }
      ],
      temperature: 0.85,
      frequency_penalty: 0.4,
      max_tokens: 800
    });
    
    const response = completion.choices[0].message.content;
    
    // Parse the response to extract individual suggestions
    // The AI will likely format them with numbers or separators
    const suggestions = response
      .split(/\n\n+|\d+[\.\)]\s+/)
      .filter(s => s.trim().length > 10)
      .slice(0, 3)
      .map(s => s.trim());
    
    // If parsing didn't work well, just split by double newlines
    if (suggestions.length < 3) {
      const fallbackSuggestions = response
        .split(/\n\n+/)
        .filter(s => s.trim().length > 10)
        .slice(0, 3)
        .map(s => s.trim().replace(/^\d+[\.\)]\s*/, ''));
      
      res.json({
        success: true,
        suggestions: fallbackSuggestions.length >= 3 ? fallbackSuggestions : [
          response.trim()
        ],
        searchStatus: searchStatus
      });
    } else {
      res.json({
        success: true,
        suggestions: suggestions,
        searchStatus: searchStatus
      });
    }
  } catch (error) {
    console.error('OpenAI error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate suggestions' 
    });
  }
});

// API endpoint to check configuration status
app.get('/api/config', (req, res) => {
  const config = {
    mastodon: {
      configured: !!(process.env.MASTODON_ACCESS_TOKEN && process.env.MASTODON_API_URL),
      apiUrl: process.env.MASTODON_API_URL || 'Not configured'
    },
    bluesky: {
      configured: !!(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_PASSWORD),
      identifier: process.env.BLUESKY_IDENTIFIER || 'Not configured'
    },
    linkedin: {
      configured: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_URN),
      personUrn: process.env.LINKEDIN_PERSON_URN || 'Not configured'
    },
    openai: {
      configured: !!process.env.OPENAI_API_KEY
    },
    tavily: {
      configured: !!process.env.TAVILY_API_KEY
    }
  };
  
  res.json(config);
});

// Serve static assets in production
if (process.env.DEV_MODE !== 'true') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
