import { Server } from "socket.io";
import "dotenv/config";

const origins = (process.env.ORIGIN ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const io = new Server({
  cors: {
    origin: origins
  }
});

const port = Number(process.env.PORT);

io.listen(port);
console.log(`Server is running on port ${port}`);

// Estructura: { roomId: { socketId: { socketId, userId } } }
const rooms: Record<string, Record<string, { socketId: string; userId: string }>> = {};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Usuario se une a una sala
  socket.on("join:room", (roomId: string, userId: string) => {
    socket.join(roomId);
    
    // Inicializar sala si no existe
    if (!rooms[roomId]) {
      rooms[roomId] = {};
    }

    // Agregar usuario a la sala
    rooms[roomId][socket.id] = { socketId: socket.id, userId };

    // Notificar a los usuarios existentes sobre el nuevo usuario
    const existingUsers = Object.keys(rooms[roomId]).filter(id => id !== socket.id);
    
    socket.emit("room:joined", { roomId, existingUsers });
    socket.to(roomId).emit("user:joined", socket.id);

    console.log(`User ${socket.id} joined room ${roomId}. Total users: ${Object.keys(rooms[roomId]).length}`);
  });

  // Señalización WebRTC
  socket.on("signal", (data: { to: string; from: string; signal: any; roomId: string }) => {
    const { to, from, signal, roomId } = data;
    
    if (rooms[roomId]?.[to]) {
      io.to(to).emit("signal", { from, signal });
    } else {
      console.log(`User ${to} not found in room ${roomId}`);
    }
  });

  // Usuario sale de la sala
  socket.on("leave:room", (roomId: string) => {
    if (rooms[roomId]?.[socket.id]) {
      delete rooms[roomId][socket.id];
      socket.to(roomId).emit("user:left", socket.id);
      socket.leave(roomId);
      
      // Limpiar sala si está vacía
      if (Object.keys(rooms[roomId]).length === 0) {
        delete rooms[roomId];
      }
      
      console.log(`User ${socket.id} left room ${roomId}`);
    }
  });

  // Chat en tiempo real
  socket.on("chat:message", (data: { roomId: string; userId: string; message: string }) => {
    const { roomId, userId, message } = data;
    
    const outgoingMessage = {
      userId,
      message: message.trim(),
      timestamp: new Date().toISOString()
    };

    io.to(roomId).emit("chat:message", outgoingMessage);
    console.log(`Message in room ${roomId} from ${userId}: ${message}`);
  });

  // Desconexión
  socket.on("disconnect", () => {
    // Remover usuario de todas las salas
    for (const roomId in rooms) {
      if (rooms[roomId][socket.id]) {
        delete rooms[roomId][socket.id];
        socket.to(roomId).emit("user:left", socket.id);
        
        // Limpiar sala si está vacía
        if (Object.keys(rooms[roomId]).length === 0) {
          delete rooms[roomId];
        }
      }
    }
    
    console.log(`User disconnected: ${socket.id}`);
  });
});