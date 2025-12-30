require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const {google} = require('googleapis');
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const MONGO_URI = process.env.MONGO_URI
const LASTFM_KEY = process.env.LASTFM_API_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log('db connected'))
  .catch(err => console.error('failed to connect db: ', err))

const UserSchema = new mongoose.Schema({
  spotifyId: String,
  displayName: String,
  genres: [String],
  recomTrack: []
});

const User = mongoose.model('User', UserSchema);

async function checkLikedTrack(accessToken, trackIds) {
  try {
    const response = await axios.get(`https://api.spotify.com/v1/me/tracks/contains`, {
      params: {ids: trackIds.join(',')},
      headers: {'Authorization': `Bearer ${accessToken}`}
    });
    return response.data;
  } catch (err) {
    console.error(err);
    return trackIds.map(() => false);
  }
}

app.get('/login', (req, res) => {
    const scope = 'user-read-private user-read-currently-playing user-top-read user-library-read user-library-modify';
    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI 
    }).toString()}`;

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.send('invalid code');
  }

  try {
    const response = await axios({
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        }).toString(),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        },
    });

    const accessToken = response.data.access_token;

    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: {Authorization: `Bearer ${accessToken}`}
    });

    const {id, display_name} = userRes.data;

    const userData = await User.findOneAndUpdate(
      {spotifyId: id},
      {displayName: display_name},
      {upsert: true, new: true}
    );

    console.log('saved user info on db: ', userData.displayName);

    res.redirect(`http://localhost:5173?token=${accessToken}`);
  } catch (error) {
    if (error.response) {
      console.error(error.response.data);
      console.error(error.response.status);
    } else if (error.request) {
      console.error(error.request);
    } else {
      console.error(error.message);
    }
  }
});

app.get('/current-track', async (req, res) => {
  const accessToken = req.headers.authorization;
  try {
    const response = await axios({
      method: 'get',
      url: 'https://api.spotify.com/v1/me/player/currently-playing',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.status === 204 || !response.data) {
      return res.json({message: 'no song detected'});
    }

    const trackInfo = {
      title: response.data.item.name,
      artist: response.data.item.artists.map(artist => artist.name).join(', '),
      albumImageUrl: response.data.item.album.images[0].url,
      progressMs: response.data.progress_ms,
      durationMs: response.data.item.duration_ms,
    };

    res.json(trackInfo);
  } catch (error) {
    console.error("Error fetching track:", error.response?.status);
    res.status(error.response?.status || 500).json({ error: 'failed' });
  }
});

app.get('/me', async (req, res) => {
  const token = req.headers.authorization;
  try {
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: {Authorization: `Bearer ${token}`}
    });
    
    const user = await User.findOne({spotifyId: userRes.data.id});

    if (user) {
      res.json(user);
    } else {
      res.status(404).send("no user found");
    }
  } catch (error) {
    res.status(401).send('invalid token');
  }
});

app.post('/save-genres', async (req, res) => {
  const {spotifyId, genres} = req.body;
  try {
    await User.findOneAndUpdate({spotifyId}, {genres});
    res.json({success: true});
  } catch (error) {
    res.status(500).send("failed to save");
  }
})

app.get('/search', async (req, res) => {
  const query = req.query.q;
  const token = req.headers.authorization;
  if (!token) return res.status(401).send('no token');
  try {
    const response = await axios.get(`https://api.spotify.com/v1/search`, {
      params: {
        q: query,
        type: 'track',
        limit: 10
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const tracks = response.data.tracks.items.map(item => ({
      id: item.id,
      name: item.name,
      artist: item.artists[0].name,
      albumImageUrl: item.album.images[0]?.url,
      uri: item.uri
    }));
    res.json(tracks);
  } catch (err) {
    console.error(err);
    res.status(500).send('spotify search fail');
  }
})

app.get('/analyze-my-taste', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send('no token');
  try {
    const topTrackRes = await axios.get(`https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=50`, {
      headers: {Authorization: `Bearer ${token}`}
    });
    const tracks = topTrackRes.data.items
    let allTags = [];

    for (const track of tracks) {
      const artistName = track.artists[0].name;
      const lastfmRes = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
        params: {
          method: 'artist.getTopTags',
          artist: artistName,
          api_key: LASTFM_KEY,
          format: 'json'
        }
      });
      const tags = lastfmRes.data.toptags?.tag || [];
      allTags.push(...tags.map(t => t.name.toLowerCase()));
    }

    const tagCount = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});

    const sortedTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]);

    res.json(sortedTags.slice(0, 30));
  } catch (err) {
    console.error(err);
    res.status(500).send('failed to analyze');
  }
});

app.get('/realtime-recommendation', async (req, res) => {
  const {artist, title} = req.query;
  const accessToken = req.headers.authorization?.split(' ')[1];
  try {
    const response = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
      params: {
        method: 'track.getSimilar',
        artist: artist,
        track: title,
        api_key: LASTFM_KEY,
        format: 'json',
        limit: 10
      }
    });

    const similarTrack = response.data.similartracks?.track || [];

    const spotifyTrack = await Promise.all(similarTrack.map(async (t) => {
      try {
        const searchRes = await axios.get(`https://api.spotify.com/v1/search`, {
          params: {q: `track:${t.name} artist:${t.artist.name}`, type: 'track', limit: 1},
          headers: {Authorization: `Bearer ${accessToken}`}
        });
        return searchRes.data.tracks.items[0] || null;
      } catch {return null;}
    }));

    const validTrack = spotifyTrack.filter(t => t !== null);
    const trackIds = validTrack.map(t => t.id);

    let likedStatus = [];
    if (trackIds.length > 0) {
      likedStatus = await checkLikedTrack(accessToken, trackIds);
    }

    const result = validTrack.map((t, index) => ({
      id: t.id,
      name: t.name,
      artist: t.artists[0].name,
      albumImageUrl: t.album.images[0]?.url,
      isLiked: likedStatus[index] || false
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send('recommendation error');
  }
});

app.get('/youtube-play', async (req, res) => {
  const {q} = req.query;
  try {
    const response = await youtube.search.list({
      part: 'id,snippet',
      q: q,
      maxResults: 1,
      type: 'video',
      videoCategoryId: '10'
    });
    const videoId = response.data.items[0].id?.videoId;
    res.json({videoId});
  } catch (err) {
    console.error(err);
    res.status(500).send('youtube search error')
  }
});

app.put('/save-track', async (req, res) => {
  const {trackId} = req.body;
  const token = req.headers.authorization?.split(' ')[1] || req.headers.authorization;
  try {
    await axios({
      method: 'put',
      url: `https://api.spotify.com/v1/me/tracks`,
      params: {ids: trackId},
      headers: {Authorization: `Bearer ${token}`}
    });
    res.status(200).send('saved to liked song');
  } catch (err) {
    console.error(err);
    res.status(500).send('failed to save');
  }
});

app.listen(5000, () => {
    console.log('server running');
})