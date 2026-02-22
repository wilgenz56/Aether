import { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, Download, RefreshCw, FileImage, FileVideo, FileAudio, FileText, FileArchive, File as FileIcon, Globe, ShieldCheck } from 'lucide-react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import Radar from './components/Radar';
import PeerCard from './components/PeerCard';

const generaNomeCasuale = () => {
  const animali = ["Panda", "Volpe", "Rana", "Koala", "Tigre", "Pinguino", "Gufo", "Lupo"];
  const aggettivi = ["Cosmico", "Felice", "Invisibile", "Magico", "Volante", "Misterioso"];
  return `${animali[Math.floor(Math.random() * animali.length)]} ${aggettivi[Math.floor(Math.random() * aggettivi.length)]}`;
};

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (mimeType) => {
    if (!mimeType) return <FileIcon size={36} className="text-indigo-500" />;
    if (mimeType.startsWith('image/')) return <FileImage size={36} className="text-blue-500" />;
    if (mimeType.startsWith('video/')) return <FileVideo size={36} className="text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <FileAudio size={36} className="text-yellow-500" />;
    if (mimeType.includes('pdf') || mimeType.includes('text/')) return <FileText size={36} className="text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileArchive size={36} className="text-orange-500" />;
    return <FileIcon size={36} className="text-indigo-500" />;
};

function App() {
  const [peers, setPeers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [myName, setMyName] = useState("Caricamento...");
  const [mySessionId, setMySessionId] = useState(null); 
  const [downloadUrl, setDownloadUrl] = useState(null);
  
  const stompClientRef = useRef(null); 
  const fileInputRef = useRef(null); 
  const [selectedPeer, setSelectedPeer] = useState(null); 
  const [incomingOffer, setIncomingOffer] = useState(null); 

  const fileToSendRef = useRef(null); 
  const peerConnectionRef = useRef(null); 
  const dataChannelRef = useRef(null); 
  const receivedBuffersRef = useRef([]); 
  const incomingFileInfoRef = useRef(null); 
  const [transferProgress, setTransferProgress] = useState(0); 
  const iceQueueRef = useRef([]);

  const resetTutto = () => {
    if (dataChannelRef.current) {
        dataChannelRef.current.close();
        dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
    }
    iceQueueRef.current = [];
    receivedBuffersRef.current = [];
    setTransferProgress(0);
  };

  const sendSignal = (targetId, type, data = {}) => {
      const currentId = sessionStorage.getItem('aether_id');
      if (stompClientRef.current && currentId) {
          stompClientRef.current.publish({
              destination: '/app/signal',
              body: JSON.stringify({ senderId: currentId, targetId, type, data })
          });
      } else {
          console.error(`ID o Socket mancante per inviare: ${type}`);
      }
  };

  const startWebRTC = async (targetId, isInitiator) => {
      const pc = new RTCPeerConnection({ 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
      });
      peerConnectionRef.current = pc;

      pc.onicecandidate = (event) => {
          if (event.candidate) {
              setTimeout(() => {
                  sendSignal(targetId, 'ice_candidate', { candidate: event.candidate });
              }, 500); 
          }
      };

      if (isInitiator) {
          const dc = pc.createDataChannel('fileTransfer', { ordered: true });
          dataChannelRef.current = dc;
          setupDataChannel(dc);

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(targetId, 'webrtc_offer', { sdp: pc.localDescription });
      } else {
          pc.ondatachannel = (event) => setupDataChannel(event.channel);
      }
  };

  const setupDataChannel = (dc) => {
      dc.binaryType = 'arraybuffer';
      dc.onopen = () => {
          if (fileToSendRef.current) sendFileChunks(dc, fileToSendRef.current);
      };
      dc.onmessage = (event) => {
          if (event.data === 'EOF') {
              const blob = new Blob(receivedBuffersRef.current);
              setDownloadUrl(URL.createObjectURL(blob));
              receivedBuffersRef.current = [];
              setTransferProgress(0);
          } else {
              receivedBuffersRef.current.push(event.data);
              const receivedSize = receivedBuffersRef.current.reduce((acc, val) => acc + val.byteLength, 0);
              if (incomingFileInfoRef.current) {
                  setTransferProgress(Math.round((receivedSize / incomingFileInfoRef.current.rawSize) * 100));
              }
          }
      };
  };

  const sendFileChunks = (dc, file) => {
      const chunkSize = 16384; 
      let offset = 0;
      const reader = new FileReader();
      reader.onload = (e) => {
          if (dc.readyState !== 'open') return;
          dc.send(e.target.result); 
          offset += e.target.result.byteLength;
          setTransferProgress(Math.round((offset / file.size) * 100));
          if (offset < file.size) readSlice(offset);
          else {
              dc.send('EOF'); 
              setTimeout(() => {
                  setTransferProgress(0);
                  fileToSendRef.current = null;
              }, 1000);
          }
      };
      const readSlice = (o) => reader.readAsArrayBuffer(file.slice(o, o + chunkSize));
      readSlice(0); 
  };

  useEffect(() => {

    document.title = "Aether.";
    
    let active = true;
    const initializeApp = async () => {
        const id = "u_" + Math.random().toString(36).substring(2, 12);
        setMySessionId(id);
        sessionStorage.setItem('aether_id', id);
        const myType = /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
        let fetchedName = "";

        const BACKEND_URL = 'https://aether-backend-u973.onrender.com';

        try {
            const response = await fetch(`${BACKEND_URL}/get-name`);
            fetchedName = response.ok ? await response.text() : generaNomeCasuale();
        } catch (error) { fetchedName = generaNomeCasuale(); }

        if (!active) return;
        setMyName(fetchedName);

        const client = new Client({
          webSocketFactory: () => new SockJS(`${BACKEND_URL}/ws`),
          onConnect: () => {
            setIsConnected(true);
            
            client.subscribe(`/topic/peer/${id}`, async (messaggio) => {
            const signal = JSON.parse(messaggio.body);

                if (signal.type === 'file_offer') {
                    resetTutto(); 
                    incomingFileInfoRef.current = signal.data;
                    setIncomingOffer(signal);
                } 
                else if (signal.type === 'offer_accepted') {
                    startWebRTC(signal.senderId, true);
                } 
                else if (signal.type === 'webrtc_offer') {
                    await startWebRTC(signal.senderId, false);
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.data.sdp));
                    
                    iceQueueRef.current.forEach(c => peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c)));
                    iceQueueRef.current = [];
                    
                    const answer = await peerConnectionRef.current.createAnswer();
                    await peerConnectionRef.current.setLocalDescription(answer);
                    sendSignal(signal.senderId, 'webrtc_answer', { sdp: peerConnectionRef.current.localDescription });
                } 
                else if (signal.type === 'webrtc_answer') {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.data.sdp));
                    iceQueueRef.current.forEach(c => peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c)));
                    iceQueueRef.current = [];
                } 
                else if (signal.type === 'ice_candidate') {
                    const pc = peerConnectionRef.current;
                    if (pc && pc.remoteDescription) {
                        pc.addIceCandidate(new RTCIceCandidate(signal.data.candidate)).catch(e => console.error("Errore ICE", e));
                    } else {
                        iceQueueRef.current.push(signal.data.candidate); 
                    }
                }
            });

            client.subscribe('/topic/room', (m) => setPeers(JSON.parse(m.body)));
            client.publish({ destination: '/app/join', body: JSON.stringify({ id, nome: fetchedName, tipo: myType }) });
          }
        });
        stompClientRef.current = client;
        client.activate();
    };
    initializeApp();
    return () => { active = false; if (stompClientRef.current) stompClientRef.current.deactivate(); };
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-50 font-sans text-slate-800 overflow-x-hidden selection:bg-indigo-200">
      
      {/* 🎨 SFONDO ETEREO (Riempie gli spazi vuoti con morbidi colori) */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-indigo-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-60"></div>
        <div className="absolute top-[20%] right-[-10%] w-[30rem] h-[30rem] bg-purple-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-60"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[35rem] h-[35rem] bg-pink-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-50"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto p-4 sm:p-8 flex flex-col min-h-screen">
        
        {/* HEADER MODERNO */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-12 mt-4">
          <div className="flex flex-col items-center sm:items-start">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-700 to-purple-600">
                AETHER.
              </h1>
              <p className="text-sm font-medium text-slate-500 tracking-wide uppercase mt-1">Local P2P Share</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="bg-white/60 backdrop-blur-md border border-white/40 shadow-sm px-5 py-2.5 rounded-full flex items-center">
                  <span className="text-sm text-slate-600 font-medium">Sei:</span>
                  <span className="font-bold text-indigo-700 ml-2 truncate max-w-[150px]">{myName}</span>
              </div>
              
              <div className="bg-white/60 backdrop-blur-md border border-white/40 shadow-sm px-5 py-2.5 rounded-full flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    {isConnected && <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping"></span>}
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  </span>
                  <span className="text-sm font-bold text-slate-700">{isConnected ? 'Online' : 'Offline'}</span>
              </div>
          </div>
        </header>

        {/* PANNELLO DI VETRO PRINCIPALE */}
        <main className="flex-1 bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2.5rem] p-6 sm:p-10 relative flex flex-col">
          
          {transferProgress > 0 && (
              <div className="mb-10 p-5 bg-white/80 border border-indigo-100 rounded-2xl shadow-sm animate-pulse">
                  <div className="flex justify-between items-end mb-3">
                      <div className="flex items-center gap-3">
                          <Loader2 className="animate-spin text-indigo-600" size={24} />
                          <span className="font-bold text-indigo-900">Trasferimento in corso...</span>
                      </div>
                      <span className="text-xl font-black text-indigo-600">{transferProgress}%</span>
                  </div>
                  <div className="w-full bg-indigo-100 h-3 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300 ease-out" style={{width: `${transferProgress}%`}}></div>
                  </div>
              </div>
          )}

          {downloadUrl && (
            <div className="mb-10 p-8 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-[2rem] flex flex-col items-center shadow-lg fade-in relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-200 rounded-full mix-blend-multiply filter blur-2xl opacity-50 translate-x-1/2 -translate-y-1/2"></div>
                <div className="bg-white p-4 rounded-full text-green-500 mb-4 shadow-sm z-10"><Check size={36} strokeWidth={3} /></div>
                <p className="text-green-900 font-black text-2xl mb-8 z-10">File Ricevuto!</p>
                
                <div className="flex w-full sm:w-3/4 gap-3 z-10">
                  <button onClick={() => { setDownloadUrl(null); resetTutto(); }} className="p-4 bg-white border border-green-200 text-green-700 hover:bg-green-100 transition-colors rounded-2xl shadow-sm">
                      <RefreshCw size={24}/>
                  </button>
                  <a href={downloadUrl} download={incomingFileInfoRef.current?.fileName} 
                     className="flex-1 bg-green-600 hover:bg-green-700 transition-colors text-white py-4 rounded-2xl font-bold flex justify-center items-center gap-3 shadow-md shadow-green-200"
                     onClick={() => setTimeout(() => { setDownloadUrl(null); resetTutto(); }, 1000)}>
                    <Download size={22} /> <span>SALVA NEL DISPOSITIVO</span>
                  </a>
                </div>
            </div>
          )}

          <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => {
              const file = e.target.files[0];
              if (file && selectedPeer) {
                  resetTutto(); 
                  fileToSendRef.current = file;
                  sendSignal(selectedPeer.id, 'file_offer', { 
                      fileName: file.name, 
                      rawSize: file.size, 
                      fileType: file.type, 
                      senderName: myName 
                  });
              }
              e.target.value = ''; // Reset per iOS Safari: senza questo, la seconda selezione non attiva onChange
          }} />

          {/* CONTENUTO CENTRALE (Radar o Card) */}
          <div className="flex-1 flex flex-col justify-center">
            {peers.length <= 1 ? (
              <div className="flex flex-col items-center justify-center py-10">
                  <Radar />
                  <p className="mt-8 text-slate-500 font-medium text-center max-w-sm">
                      In attesa di altri dispositivi... Assicurati che siano collegati alla stessa rete Wi-Fi.
                  </p>
              </div>
            ) : (
              <div className="fade-in h-full">
                 <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-2">
                     Dispositivi vicini
                     <span className="bg-indigo-100 text-indigo-700 text-sm py-1 px-3 rounded-full">{peers.length - 1}</span>
                 </h2>
                 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                     {peers.filter(p => p.id !== mySessionId).map(p => (
                       <PeerCard key={p.id} deviceName={p.nome} deviceType={p.tipo} onSendClick={() => { setSelectedPeer(p); fileInputRef.current.click(); }} />
                     ))}
                 </div>
              </div>
            )}
          </div>
        </main>

        {/* FOOTER INFORMATIVO */}
        <footer className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-xs font-semibold text-slate-400">
            <div className="flex items-center gap-1.5"><Globe size={14} /> <span>Local Network Only</span></div>
            <div className="hidden sm:block w-1 h-1 bg-slate-300 rounded-full"></div>
            <div className="flex items-center gap-1.5"><ShieldCheck size={14} /> <span>End-to-End Encrypted via WebRTC</span></div>
        </footer>

      </div>

      {/* POPUP RICEZIONE (Glassmorphism estremo) */}
      {incomingOffer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white/90 backdrop-blur-xl border border-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.15)] flex flex-col relative overflow-hidden">
                
                {/* Elemento decorativo nel popup */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100 rounded-full mix-blend-multiply filter blur-xl opacity-70 translate-x-1/3 -translate-y-1/3"></div>

                <div className="text-center mb-8 relative z-10">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">File in arrivo!</h3>
                    <p className="text-slate-500 font-medium mt-2">
                        Da <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{incomingOffer.data.senderName}</span>
                    </p>
                </div>
                
                <div className="bg-white rounded-2xl p-5 flex items-center gap-4 mb-8 shadow-sm border border-slate-100 relative z-10">
                    <div className="bg-slate-50 p-3 rounded-xl flex-shrink-0">
                        {getFileIcon(incomingOffer.data.fileType)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-slate-900 font-bold truncate text-base mb-1" title={incomingOffer.data.fileName}>
                            {incomingOffer.data.fileName}
                        </p>
                        <p className="text-indigo-500 text-sm font-black">
                            {formatBytes(incomingOffer.data.rawSize)}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 relative z-10">
                    <button onClick={() => { setIncomingOffer(null); resetTutto(); }} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors rounded-2xl font-bold">
                        Rifiuta
                    </button>
                    <button onClick={() => { 
                        sendSignal(incomingOffer.senderId, 'offer_accepted'); 
                        setIncomingOffer(null); 
                    }} className="flex-[1.5] py-4 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2">
                        <Check size={20} strokeWidth={3} />
                        <span>Accetta File</span>
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;
