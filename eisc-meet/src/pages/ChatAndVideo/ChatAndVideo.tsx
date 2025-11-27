// src/pages/ChatAndVideo/ChatAndVideo.tsx - VERSIÓN COMPLETA Y FUNCIONAL
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io, { Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import useAuthStore from "../../stores/useAuthStore";
import "./ChatAndVideo.css";

interface Message {
  userId: string;
  message: string;
  timestamp: string;
}

const ChatAndVideo: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [waitingForPeer, setWaitingForPeer] = useState(true);
  const [remoteMuted, setRemoteMuted] = useState(false);

  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isInitiatorRef = useRef(false);
  const pendingSignalsRef = useRef<any[]>([]);
  const processedMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!roomId || !user) {
      navigate("/login");
      return;
    }

    console.log("🚀 Iniciando conexión para sala:", roomId);

    const newSocket = io("http://localhost:9000", {
      transports: ["websocket"],
      reconnection: true,
    });

    setSocket(newSocket);
    socketRef.current = newSocket;

    // Obtener media local
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        console.log("✅ Stream local obtenido");
        console.log("🎵 Audio tracks:", stream.getAudioTracks().length);
        console.log("📹 Video tracks:", stream.getVideoTracks().length);

        setLocalStream(stream);
        localStreamRef.current = stream;
        setConnectionStatus("connected");

        // Unirse a la sala después de obtener el stream
        newSocket.emit("join:room", roomId, user.email);
        console.log("📡 Emitido join:room");
      })
      .catch((err) => {
        console.error("❌ Error al acceder a los dispositivos:", err);
        setConnectionStatus("error");
        alert(
          "No se pudo acceder a la cámara o micrófono. Verifica los permisos."
        );
      });

    // Listener: Sala unida
    newSocket.on(
      "room:joined",
      ({ existingUsers }: { existingUsers: string[] }) => {
        console.log("🏠 Sala unida. Usuarios existentes:", existingUsers);

        if (existingUsers.length > 0 && existingUsers[0] !== newSocket.id) {
          console.log("👤 Iniciando como INICIADOR");
          isInitiatorRef.current = true;
          setWaitingForPeer(false);

          setTimeout(() => {
            if (localStreamRef.current) {
              initializePeerConnection(true, newSocket, existingUsers[0]);
            }
          }, 1000);
        } else {
          console.log("⏳ Esperando otro usuario...");
          isInitiatorRef.current = false;
          setWaitingForPeer(true);
        }
      }
    );

    // Listener: Nuevo usuario
    newSocket.on("user:joined", (userId: string) => {
      console.log("🆕 Nuevo usuario:", userId);

      if (!isInitiatorRef.current && !peerRef.current) {
        console.log("👤 Ahora seremos INICIADOR");
        isInitiatorRef.current = true;
        setWaitingForPeer(false);

        setTimeout(() => {
          if (localStreamRef.current) {
            initializePeerConnection(true, newSocket, userId);
          }
        }, 1000);
      }
    });

    // Listener: Señales WebRTC
    newSocket.on(
      "signal",
      ({ from, signal }: { from: string; signal: any }) => {
        console.log(
          "📥 Señal recibida de:",
          from,
          "Tipo:",
          signal.type || "candidate"
        );

        if (peerRef.current) {
          try {
            peerRef.current.signal(signal);
            console.log("✅ Señal procesada");
          } catch (err) {
            console.error("❌ Error al procesar señal:", err);
          }
        } else {
          if (signal.type === "offer") {
            console.log("📨 Offer recibida, creando peer como RECEPTOR");
            isInitiatorRef.current = false;

            if (localStreamRef.current) {
              initializePeerConnection(false, newSocket, from, signal);
            } else {
              console.warn("⚠️ Stream no listo, guardando señal");
              pendingSignalsRef.current.push({ from, signal });
            }
          } else {
            console.log("📦 Guardando señal para procesar después");
            pendingSignalsRef.current.push({ from, signal });
          }
        }
      }
    );

    // Listener: Usuario se fue
    newSocket.on("user:left", (userId: string) => {
      console.log("👋 Usuario se fue:", userId);
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      setRemoteStream(null);
      setWaitingForPeer(true);
      isInitiatorRef.current = false;
    });

    // Listener: Mensajes
    newSocket.on("chat:message", (message: Message) => {
      // Crear identificador único del mensaje
      const messageId = `${message.userId}-${message.message}-${message.timestamp}`;
      
      // Solo agregar si no ha sido procesado antes
      if (!processedMessagesRef.current.has(messageId)) {
        processedMessagesRef.current.add(messageId);
        setMessages((prev) => [...prev, message]);
      }
    });

    // Cleanup
    return () => {
      console.log("🧹 Limpiando recursos...");
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      if (newSocket.connected) {
        newSocket.emit("leave:room", roomId);
        newSocket.disconnect();
      }
    };
  }, [roomId, user, navigate]);

  const initializePeerConnection = (
    initiator: boolean,
    socket: Socket,
    targetUserId: string,
    initialSignal?: any
  ) => {
    console.log(`🔗 Inicializando peer - Iniciador: ${initiator}`);

    if (!localStreamRef.current) {
      console.error("❌ No hay stream local");
      return;
    }

    if (peerRef.current) {
      console.log("🗑️ Destruyendo peer anterior");
      peerRef.current.destroy();
    }

    try {
      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream: localStreamRef.current,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" },
          ],
        },
      });

      peer.on("signal", (signal) => {
        console.log("📤 Enviando señal:", signal.type || "candidate");
        socket.emit("signal", {
          to: targetUserId,
          from: socket.id || "",
          signal,
          roomId,
        });
      });

      peer.on("stream", (stream) => {
        console.log("🎥 Stream remoto recibido!");
        console.log("🎵 Audio tracks:", stream.getAudioTracks().length);
        console.log("📹 Video tracks:", stream.getVideoTracks().length);

        stream.getAudioTracks().forEach((track, i) => {
          console.log(`🔊 Audio ${i}:`, {
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          });
        });

        // Solo actualizar el estado - el callback ref maneja el srcObject
        setRemoteStream(stream);
        setWaitingForPeer(false);
      });

      peer.on("connect", () => {
        console.log("✅ Peer conectado!");
        setWaitingForPeer(false);
      });

      peer.on("error", (err) => {
        console.error("❌ Error en peer:", err);
      });

      peer.on("close", () => {
        console.log("🔌 Peer cerrado");
        setRemoteStream(null);
        setWaitingForPeer(true);
      });

      if (initialSignal) {
        console.log("🔄 Procesando señal inicial");
        peer.signal(initialSignal);
      }

      if (pendingSignalsRef.current.length > 0) {
        console.log(
          `📦 Procesando ${pendingSignalsRef.current.length} señales pendientes`
        );
        pendingSignalsRef.current.forEach(({ signal }) => {
          try {
            peer.signal(signal);
          } catch (err) {
            console.error("❌ Error procesando señal pendiente:", err);
          }
        });
        pendingSignalsRef.current = [];
      }

      peerRef.current = peer;
      console.log("✅ Peer creado");
    } catch (err) {
      console.error("❌ Error creando peer:", err);
    }
  };

  const sendMessage = () => {
    if (inputValue.trim() && socket && roomId) {
      const timestamp = new Date().toISOString();
      const userId = user?.displayName || "Usuario";
      
      // Enviar al servidor (el servidor lo distribuirá a TODOS)
      socket.emit("chat:message", {
        roomId,
        userId: userId,
        message: inputValue,
        timestamp: timestamp,
      });
      
      setInputValue("");
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
        console.log("🔊 Audio:", audioTrack.enabled ? "ON" : "OFF");
      }
    }
  };

  const toggleRemoteMute = () => {
    setRemoteMuted(!remoteMuted);
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        console.log("📹 Video:", videoTrack.enabled ? "ON" : "OFF");
      }
    }
  };

  const leaveRoom = () => {
    if (socket && roomId) {
      socket.emit("leave:room", roomId);
    }
    navigate("/profile");
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setShowCopyNotification(true);
      setTimeout(() => setShowCopyNotification(false), 2000);
    });
  };

  return (
    <div className="chat-video-container">
      <div className="video-section">
        <div className="video-container">
          <div className="videos-grid">
            {/* Video Local - CALLBACK REF */}
            <div className="video-wrapper local-video">
              {localStream ? (
                <video
                  autoPlay
                  muted={muted}
                  playsInline
                  ref={(video) => video && (video.srcObject = localStream)}
                />
              ) : (
                <div className="video-loading">
                  <div className="spinner"></div>
                  <p>Cargando cámara...</p>
                </div>
              )}
              <span className="video-label">
                {user?.displayName || "Tú"}
                {!videoEnabled && " (Cámara OFF)"}
              </span>
            </div>

            {/* Video Remoto - CALLBACK REF PARA AUDIO */}
            {remoteStream ? (
              <div className="video-wrapper remote-video">
                <video
                  autoPlay
                  playsInline
                  muted={remoteMuted}
                  ref={(video) => video && (video.srcObject = remoteStream)}
                />
                <span className="video-label">
                  Participante 🟢
                  <button 
                    onClick={toggleRemoteMute}
                    style={{
                      marginLeft: '8px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      background: remoteMuted ? '#dc2626' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px'
                    }}
                  >
                    {remoteMuted ? '🔇 Audio OFF' : '🔊 Audio ON'}
                  </button>
                </span>
              </div>
            ) : (
              <div className="video-wrapper waiting">
                <div className="waiting-content">
                  {waitingForPeer ? (
                    <>
                      <div className="spinner"></div>
                      <p>Esperando a otro participante...</p>
                      <p className="room-code">
                        Código: <strong>{roomId}</strong>
                      </p>
                      <button className="share-link-btn" onClick={copyRoomLink}>
                        📋 Compartir enlace
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="spinner"></div>
                      <p>Conectando con participante...</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {connectionStatus === "error" && (
            <div className="video-error">
              <p>❌ Error al acceder a la cámara o micrófono</p>
              <p>Permite el acceso en tu navegador</p>
            </div>
          )}
        </div>

        {/* Controles */}
        <div className="video-controls">
          <button
            className={`control-button mute-button ${muted ? "muted" : ""}`}
            onClick={toggleMute}
            disabled={connectionStatus !== "connected"}
          >
            {muted ? "🔇" : "🎤"} {muted ? "Activar" : "Silenciar"}
          </button>

          <button
            className={`control-button video-button ${
              !videoEnabled ? "disabled" : ""
            }`}
            onClick={toggleVideo}
            disabled={connectionStatus !== "connected"}
          >
            {videoEnabled ? "📹" : "🚫"} Cámara
          </button>

          <button className="control-button share-button" onClick={copyRoomLink}>
            🔗 Compartir
          </button>

          <button className="control-button leave-button" onClick={leaveRoom}>
            📞 Salir
          </button>
        </div>
      </div>

      {/* Chat */}
      <div className="chat-section">
        <div className="chat-header">
          <h3>💬 Chat</h3>
          <p>{messages.length} mensajes</p>
          <span className="room-id">Sala: {roomId}</span>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <p>No hay mensajes</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className="message-item">
                <div className="message-header">
                  <span className="message-user">{msg.userId}</span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="message-text">{msg.message}</p>
              </div>
            ))
          )}
        </div>

        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <input
              className="chat-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe un mensaje..."
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={!inputValue.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      {showCopyNotification && (
        <div className="copy-notification">✓ Link copiado</div>
      )}
    </div>
  );
};

export default ChatAndVideo;