import { useEffect, useState } from 'react'
import axios from 'axios'

function App() {
  const [isClosing, setIsClosing] = useState(false);
  const [token, setToken] = useState(null);
  const [track, setTrack] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState([]);
  const [genreList, setGenreList] = useState([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [recommendation, setRecommendation] = useState([]);
  const [activeVideoId, setActiveVideoId] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('spotify_token');
    const hash = new URLSearchParams(window.location.search);
    const _token = hash.get('token');

    if (_token) {
      setToken(_token);
      localStorage.setItem('spotify_token', _token);
      window.history.pushState({}, null, '/');
    } else if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (token) {
      axios.get('http://localhost:5000/me', {headers: {Authorization: token}})
        .then(res => setUserInfo(res.data))
        .catch(err => console.error(err));
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    getMyTrack();
    const timer = setInterval(() => {
      getMyTrack();
    }, 1000);

    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (userInfo && userInfo.genres.length === 0) {
      const setGenres = async () => {
        setGenreLoading(true);
        try {
          const res = await axios.get('http://localhost:5000/analyze-my-taste', {
            headers: { Authorization: token }
          });
          const recc = res.data;
          setGenreList(recc);
        } catch (err) {
          console.error(err);
        } finally {
          setGenreLoading(false);
        }
      };
      setGenres();
    }
  }, [userInfo, token]);

  useEffect(() => {
    if (track && track.title && track.artist) {
      axios.get(`http://localhost:5000/realtime-recommendation`, {
        params: {
          artist: track.artist.split(',')[0],
          title: track.title
        },
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(async (res) => {
        setRecommendation(res.data);
      })
      .catch(err => console.error(err));
    }
  }, [track?.title, token]);

  const formatTime = (ms) => {
    if (!ms) return "0:00";
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`
  };

  const handleSaveGenres = async () => {
    if (selectedGenres.length !== 0) {
      try {
        await axios.post('http://localhost:5000/save-genres', {
          spotifyId: userInfo.spotifyId,
          genres: selectedGenres
        });
        setIsClosing(true);
        setTimeout(async () => {
          const res = await axios.get('http://localhost:5000/me', {headers: {Authorization: token}});
          setUserInfo(res.data);
        }, 1000);
      } catch (err) {
        alert('저장 실패');
      }
    } else {
      alert('1개 이상의 장르를 선택하세요'); // 임시 경고창
    }
  };

  const getMyTrack = async () => {
    try {
      const response = await axios.get('http://localhost:5000/current-track', {
        headers: {
          Authorization: token
        }
      });
      setTrack(response.data);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        logout();
      }
      console.error(err);
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('spotify_token');
  }

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      const response = await axios.get(`http://localhost:5000/search?q=${searchQuery}`, {headers: {Authorization: token}});
      setSearchResult(response.data);
    } catch (err) {
      console.error('검색 오류: ', err)
    }
  }

  const handlePlaySong = async (title, artist) => {
    try {
      const searchQuery= `${title} ${artist}`
      const res = await axios.get(`http://localhost:5000/youtube-play?q=${searchQuery}`);
      if (res.data.videoId) {
        setActiveVideoId(res.data.videoId);
      } else {
        alert('no video');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveTrack = async (e, trackId) => {
    e.stopPropagation();
    try {
      await axios.put('http://localhost:5000/save-track', {trackId}, {
        headers: {Authorization: token}
      });
    } catch (err) {
      alert('저장 실패')
    }
  };

  const loginUrl = `http://localhost:5000/login`;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100vw',
      minHeight: '100vh',
      backgroundColor: '#121212',
      color: 'white',
    }}>
      {!token ? (
        <a href={loginUrl}>로그인</a>
      ) : (
        <>
          <div style={{
            display: 'flex', 
            flexDirection: 'row', 
            alignItems: 'flex-start', 
            justifyContent: 'center', 
            width: '90%', 
            maxWidth: '100vw', 
            gap: '60px', 
            marginTop: '40px'
          }}>
            {track && track.title ? (
              <>
                <div style={{
                  marginRight: '45px',
                  flex: 1,
                  maxWidth: '400px',
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'flex-start', 
                  justifyContent: 'flex-start'
                }}>
                  <div style={{textAlign: 'left', justifyContent: 'left'}}>
                    <div 
                      title={track.title}
                      style={{
                        marginTop: '-10px',
                        fontSize: '40px',
                        marginBottom: '-5px', 
                        fontWeight: 'bold', 
                        color: 'white',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '400px'
                    }}>
                      {track.title}
                    </div>
                    <div style={{
                      marginTop: '0',
                      fontSize: '26px',
                      marginBottom: '-10px', 
                      fontWeight: 'bold', 
                      color: 'white'
                    }}>하고 비슷한 노래</div>
                  </div>
                  <div style={{
                    overflowX: 'hidden', 
                    overflowY: 'auto', 
                    maxHeight: '500px',
                    marginTop: '20px', 
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderRadius: '15px', 
                    padding: '20px', 
                    width: '100%', 
                    minHeight: '500px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: recommendation.length > 0 ? 'flex-start' : 'center', alignItems: 'center'
                  }}>
                    {recommendation.map((rec, index) => (
                      <div 
                        key={index}
                        onClick={() => handlePlaySong(rec.name, rec.artist.name)}
                        className='song-result-box'
                      >
                        <img 
                        src={rec.albumImageUrl || '/vinyl.png'} 
                        alt='album' 
                        style={{
                          width: '50px', 
                          height: '50px', 
                          borderRadius: '5px'
                        }}></img>
                        <div className='song-info-container' style={{textAlign: 'left'}}>
                          <div style={{fontWeight: 'bold'}}>{rec.name}</div>
                          <div>{rec.artist}</div>
                        </div>
                        <button 
                          className="save-heart-btn"
                          onClick={(e) => handleSaveTrack(e, rec.id)}
                        >
                          ♡
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <img 
                    src={track.albumImageUrl} 
                    alt='album art' 
                    style={{
                      width: '500px', 
                      borderRadius: '15px', 
                      boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                    }}></img>
                  <div 
                    title={track.title}
                    style={{
                      fontSize: '30px', 
                      marginTop:'20px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '500px'
                  }}>
                    {track.title}
                  </div>
                  <p>{track.artist}</p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '450px',
                    gap: '15px',
                  }}>
                    <span style={{
                      fontSize: '14px', 
                      color: '#b3b3b3', 
                      minWidth: '40px', 
                      textAlign: 'right'
                    }}>
                      {formatTime(track.progressMs)}
                    </span>
                    <div style={{
                      width: '100%',
                      height:'4px',
                      backgroundColor: "#535353",
                      borderRadius: '2px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${(track.progressMs / track.durationMs) * 100}%`,
                        height: '100%',
                        backgroundColor: '#1DB954',
                        transition: 'width 1s linear'
                      }}></div>
                    </div>
                    <span style={{
                      fontSize: '14px', 
                      color: '#b3b3b3', 
                      minWidth: '40px', 
                      textAlign: 'left'
                    }}>
                      {formatTime(track.durationMs)}
                    </span>
                  </div> 
                </div>
              </>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: '500px', 
                  height: '500px',
                  borderRadius: '15px',
                  backgroundColor: '#282828',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '20px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                  }}>
                  <img 
                    src='/vinyl.png' 
                    style={{
                      width: '300px',
                      opacity: 0.5,
                    }}></img>
                </div>
                <p style={{fontSize: '30px', marginTop: '20px'}}>현재 재생중인 곡이 없어요. 😢</p>
                <p style={{fontSize: '20px', marginTop: '-10px'}}>스포티파이에서 노래를 재생해보세요!</p>
              </div>
            )}
            <div style={{
              maxWidth: '400px',
              display: 'flex', 
              flex: 1,
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              <h1 style={{
                fontSize: '40px',
                marginBottom: '20px', 
                fontWeight: 'bold', 
                color: 'white'
              }}>
                노래 검색하기
              </h1>
              <div style={{display: 'flex', gap: '10px'}}> 
                <input 
                  type='text' 
                  placeholder='노래 검색' 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  style={{
                    padding: '10px 30px', 
                    borderRadius: '10px', 
                    border: 'none', 
                    backgroundColor: '#282828', 
                    color: 'white', 
                    fontSize: '16px'
                  }}></input>
                <button 
                  onClick={handleSearch} 
                  style={{
                    padding: '10px 30px', 
                    borderRadius: '10px', 
                    border: 'none', 
                    backgroundColor: '#1DB954', 
                    color: 'white', 
                    fontWeight: 'bold', 
                    cursor: 'pointer'
                  }}>
                    검색
                  </button>
              </div>
              <div style={{
                overflowX: 'hidden', 
                overflowY: 'auto', 
                height: '450px', 
                marginTop: '20px', 
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: '15px', 
                padding: '20px', 
                width: '100%', 
                minHeight: '300px', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: searchResult.length > 0 ? 'flex-start' : 'center', alignItems: 'center'
              }}>
                {searchResult.length > 0 ? (
                  searchResult.map(song => (
                    <div 
                      key={song.id} 
                      className='song-result-box'
                      onClick={() => handlePlaySong(song.name, song.artist)}
                    >
                      <img 
                        src={song.albumImageUrl} 
                        alt='album' 
                        style={{
                          width: '50px', 
                          height: '50px', 
                          borderRadius: '5px'
                        }}></img>
                      <div style={{textAlign: 'left'}}>
                        <div style={{fontWeight: 'bold', fontSize: '16px'}}>{song.name}</div>
                        <div style={{fontSize: '14px', color: '#b3b3b3'}}>{song.artist}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{
                    textAlign: 'center', 
                    fontSize: '14px', 
                    color: '#535151ff'
                  }}>
                    검색 결과가 여기에 표시돼요. 당장 하나 검색해볼까요?
                  </p>
                )}
              </div>
            </div>
          </div>
          <button style={{marginTop: '20px'}} onClick={logout}>logout</button>
          {userInfo && userInfo.genres.length === 0 ? (
            <div style={{
              position: 'fixed', 
              zIndex: 500, 
              top: 0, left: 0, bottom: 0, right: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: 'rgba(15, 23, 42, 0.3)', 
              backdropFilter: 'blur(7px)'
            }}>
              <div 
                className={isClosing ? 'animate-box-shutdown' : 'animate-box-popup'} 
                style={{
                  overflowY: 'auto',
                  position: 'relative', 
                  display:'flex', 
                  zIndex: 510, 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  backgroundColor: 'rgba(30, 30, 30, 0.5)', 
                  backdropFilter: 'blur(10px)', 
                  width: '70%', 
                  minWidth: '1000px', 
                  minHeight: '500px', 
                  maxHeight: '700px',
                  borderRadius: '1.5rem', 
                  boxShadow: '0 0 50px #669657a6'
                }}>
                {genreLoading ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    width: '100%',
                    minHeight: '400px'
                  }}>
                    <div className='dot-container'>
                      <div className='dot'></div>
                      <div className='dot'></div>
                      <div className='dot'></div>
                    </div>
                    <p style={{fontSize: '24px', color: 'white', marginBottom: '0px'}}>데이터 바다에서 취향을 찾는중...</p>
                    <p style={{fontSize: '16px', color: 'white'}}>조금만 기다려줘요! 거의 다 찾았어요.</p>
                  </div>
                ) : (
                  <>
                    <h1 style={{
                      fontSize: '40px', 
                      marginTop: '40px', 
                      marginBottom: '10px', 
                      fontWeight: 'bold', 
                      color: 'white'
                    }}>
                      나만의 음악 취향 선택하기
                    </h1>
                    <h2 style={{
                      fontSize: '20px', 
                      marginBottom: '30px', 
                      fontWeight: 'bold', 
                      color: 'white'
                    }}>
                      {userInfo.displayName}님의 음악 취향이 아직 등록되어 있지 않아요. 걱정마세요! 장르는 저희가 다 골라놨어요.
                    </h2>
                    <div style={{
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      justifyContent: 'center', 
                      gap: '15px', 
                      marginBottom: '40px', 
                      marginLeft: '30px', 
                      marginRight: '30px'
                    }}>
                      {genreList.map(g => (
                        <button 
                          className='genre-item-btn'
                          style={{
                            padding: '20px 50px', 
                            fontSize: '30px', 
                            borderRadius: '50px', 
                            border: 'none', 
                            backgroundColor: selectedGenres.includes(g) ? '#1DB954' : 'white', 
                            color: selectedGenres.includes(g) ? 'white' : '#121212', transition: 'all 0.2s ease'
                          }} 
                          key={g} 
                          onClick={() => setSelectedGenres(prev => prev.includes(g) ? prev.filter(i => i !== g): [...prev, g])}>
                          {g}
                        </button>
                      ))}
                    </div>
                    <button 
                     className='save-btn'
                      style={{
                        padding: '20px 80px', 
                        fontSize: '30px', 
                        borderRadius: '50px', 
                        border: 'none', 
                        marginBottom: '40px',
                      }}
                      onClick={handleSaveGenres}>
                        저장하기
                    </button>  
                  </>
                )}
              </div>
            </div>
          ) : null}
          <div className={`yt-pip-player ${activeVideoId ? 'active' : ''}`}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              color: 'black',
              fontWeight: 'bold'
            }}>
              <div style={{color: 'white', fontSize: '12px', margin: '0'}}>유튜브에서 재생중</div>
              <button
                onClick={() => setActiveVideoId(null)}
                className='yt-close-btn'
              >
                X
              </button>
            </div>
            <div style={{
              borderRadius: '10px',
              overflow: 'hidden',
              height: '180px'
            }}>
              {activeVideoId && (
                <iframe
                  width='100%'
                  height='100%'
                  src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1`}
                  title='youtube player'
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App