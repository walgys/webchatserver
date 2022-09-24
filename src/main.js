const { ManejadorDatos } = require('./manejadorDatos');
const moment = require('moment');
let globalState = [];
let socketUserRoomMap = {};

const server = require('http').createServer();
const manejadorDatos = ManejadorDatos.getInstancia();

const getGlobalState = async () => {
  const openSessions = await manejadorDatos.openSessions();
  globalState = openSessions;
};

const main = async () => {
  await getGlobalState();

  const socket = require('socket.io')(server, {
    cors: {
      origin: '*',
    },
    path: '/',
  });

  const reportToAllInRoom = async (session,topic,message) => {
    const sockets = await socket.fetchSockets();
    session.users.forEach(async (user) => {
      const clientSocket =
        Object.entries(socketUserRoomMap).find(
          ([keys, socketFromMap]) =>
            socketFromMap.userId !== undefined &&
            socketFromMap.userId === user.userId
        ) || undefined;
      if (!!clientSocket) {
        const client = sockets.find(
          (socketsClientSocket) => socketsClientSocket.id === clientSocket[0]
        );
        //seguir aca
        client.emit(topic, JSON.stringify(message));
      }
    });
  };

  socket.on('connection', (client) => {
    console.log(`${client.id} connected at: ${moment().toISOString()}`);
    socketUserRoomMap[client.id] = {};

    client.emit('sync');

    client.on('mensaje', (datos) => {
      const objetoDatos = JSON.parse(datos);
      client.emit('respuesta', {});
    });

    client.on('openSessions', async () => {
      const openSessions = await manejadorDatos.openSessions();
      client.emit('openSessions', JSON.stringify(openSessions));
    });

    client.on('createChatroom', async (data) => {
      const { name, user } = JSON.parse(data);
      await manejadorDatos.createChatRoom(name,user);
      const openSessions = await manejadorDatos.openSessions();
      client.emit('openSessions', JSON.stringify(openSessions));
    });

    client.on('sync', async (data) => {
      const { chatRoomId, user } = JSON.parse(data);
      if (chatRoomId && user) {
        socketUserRoomMap[client.id] = {
          chatRoomId,
          userId: user.uid,
          socketId: client.id,
        };
      }
      console.log(socketUserRoomMap)
    });

    client.on('enterChatRoom', async (data) => {
      const { chatRoomId, user } = JSON.parse(data);
      if (chatRoomId && user) {
        socketUserRoomMap[client.id] = {
          chatRoomId,
          userId: user.uid,
          socketId: client.id,
        };
        const session = await manejadorDatos.enterChatRoom(chatRoomId, user);
        if (session) {
          globalState = globalState.map((stateSession) =>
            stateSession.id === session.id ? session : stateSession
          );
          client.emit('enterChatRoom', JSON.stringify(session));
        }
      }
    });

    client.on('sendMessage', async (data) => {
      const { chatRoomId, message, user } = JSON.parse(data);
      if (chatRoomId && user && message) {
        socketUserRoomMap[client.id] = {
          chatRoomId,
          userId: user.uid,
          socketId: client.id,
        };
        const session = await manejadorDatos.updateMessages(
          chatRoomId,
          message,
          user
        );
        if (session) {
          globalState = globalState.map((stateSession) =>
            stateSession.id === chatRoomId ? session : stateSession
          );
          reportToAllInRoom(session, 'reportNewMessageToAllInRoom',session);
        }
      }
    });

    client.on('exitChatRoom', async (data) => {
      const { chatRoomId, user } = JSON.parse(data);
      if (chatRoomId && user) {
        socketUserRoomMap[client.id] = {
          chatRoomId,
          userId: user.uid,
          socketId: client.id,
        };
        const sessionState = globalState.find(se=>se.id === chatRoomId);
        const session = await manejadorDatos.exitChatRoom(chatRoomId, user);
        await reportToAllInRoom(sessionState,'exitChatRoom',JSON.stringify({user, sesion: session}));
        globalState = globalState.map((stateSession) =>
          stateSession.id === session.id ? session : stateSession
        );
        
        delete socketUserRoomMap[client.id];
    }
    })

    client.on('closeChatRoom', async (data) => {
      const { chatRoomId, user } = JSON.parse(data);
      if (chatRoomId && user) {
        const session = await manejadorDatos.closeChatRoom(chatRoomId, user.uid);
        globalState = globalState.map((stateSession) =>
          stateSession.id === session.id ? session : stateSession
        );
        reportToAllInRoom(session, 'closeChatRoom', {});
    }
    })

    client.on('disconnect', async () => {
      try {
        const { chatRoomId, userId } = socketUserRoomMap[client.id] || {};
        if (chatRoomId && userId) {
          const session = await manejadorDatos.exitChatRoom(chatRoomId, userId);
          globalState = globalState.map((stateSession) =>
            stateSession.id === session.id ? session : stateSession
          );
          delete socketUserRoomMap[client.id];
          //manejadorDatos.reportUserLeftToAllInRoom(chatRoomId,userId, session);
        }
      } catch (err) {
        console.log(err);
      }

      console.log(`${client.id} disconnected at ${moment().toISOString()}`);
    });
  });
};

main().catch((err) => console.log(err));

server.listen(9000);
console.log('started server on port 9000');
