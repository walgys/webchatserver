const { initializeApp } = require('firebase-admin/app');
require('dotenv').config();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const path = require('path');
const moment = require('moment');
const uuid = require('uuid');

class ManejadorDatos {
  #firebaseApp;
  #firestoreDB;
  static #instancia;
  constructor() {
    this.#firebaseApp = initializeApp({
      credential: admin.credential.cert({
        type: process.env.TYPE,
        project_id: process.env.PROJECT_ID,
        private_key_id: process.env.PRIVATE_KEY_ID,
        private_key: process.env.PRIVATE_KEY,
        client_email: process.env.CLIENT_EMAIL,
        client_id: process.env.CLIENT_ID,
        auth_uri: process.env.AUTH_URI,
        token_uri: process.env.TOKEN_URI,
        auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
      }),
    });
    this.#firestoreDB = getFirestore();
    console.log('ManejadorDatos');
  }

  static getInstancia() {
    if (!this.#instancia) {
      this.#instancia = new ManejadorDatos();
    }
    return this.#instancia;
  }

  //Búsquedas

  obtenerDominiosEIntenciones = async (uid) => {
    const usuarioConsola = await this.#firestoreDB
      .collection('agentes')
      .doc(uid)
      .get();

    const { negocio } = usuarioConsola.data();
    const dominios = await this.buscarDominios(negocio);
    const intenciones = await this.buscarIntenciones(negocio);
    const intencionesExpandidas = await intenciones.docs.map((intencion) => ({
      id: intencion.id,
      ...intencion.data(),
    }));

    const dominiosEIntenciones = await Promise.all(
      dominios.docs.map((dominio) => {
        const intencionesPorDominio = intencionesExpandidas.filter(
          (intencion) => intencion.dominio == dominio.id
        );

        return {
          id: dominio.id,
          ...dominio.data(),
          intenciones: intencionesPorDominio,
        };
      })
    );
    return { dominiosEIntenciones: dominiosEIntenciones, negocio: negocio };
  };

  generarId = (longitud) => {
    const caracteres =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < longitud; i++) {
      id += caracteres[Math.floor(Math.random() * caracteres.length)];
    }
    return id;
  };

  openSessions = async () => {
    const sessions = await this.#firestoreDB
      .collection('chatSessions')
      .where('status', '==', 'open')
      .get();
    return sessions.docs.map((session) => ({
      id: session.id,
      ...session.data(),
    }));
  };

  createChatRoom = async (name, user) => {
    const session = this.#firestoreDB.collection('chatSessions');
    const data = {
      fecha: moment(),
      owner: user.uid,
      room: name,
      status: 'open',
      mensajes: [],
      users:[]
    }
    session.doc().set(data);
  };

  enterChatRoom = async (id, user) => {
    const session = this.#firestoreDB.collection('chatSessions').doc(id);
    try {
      let result;
      await this.#firestoreDB.runTransaction(async (t) => {
        const doc = await t.get(session);
        const data = doc.data();
        const users = data.users;
        const newUsers = users.find((fbUser) => fbUser.userId === user.uid)
          ? users
          : [
              ...users,
              {
                avatarURL: user.photoURL || 'baseAvatar',
                userId: user.uid,
                userName: user.displayName || 'unknown',
              },
            ];
        t.update(session,{ users: newUsers });
        result = { id: doc.id, ...doc.data(), users: newUsers };
      });
      return result;
    } catch (ex) {
      console.log(ex);
      return undefined;
    }
  };

  exitChatRoom = async (id, user) => {
    const session = this.#firestoreDB.collection('chatSessions').doc(id);
    try {
      let result;
      await this.#firestoreDB.runTransaction(async (t) => {
        const doc = await t.get(session);
        const data = doc.data();
        const users = data.users;
        const newUsers = users.filter((fbUser) => fbUser.userId !== user.uid);
        const messages = data.mensajes; 
        const newMessages = [...messages, {cuerpo:{texto:`${user.displayName} ha dejado la sala`}, fecha: moment(), id: uuid.v4(), origen: 'system'}];
        t.update(session,{ users: newUsers, newMessages });
        result = { id: doc.id, ...doc.data(), users: newUsers, mensajes: newMessages };
      });

      return result;
    } catch (ex) {
      console.log(ex);
      return undefined;
    }
  };

  closeChatRoom = async (id, user) => {
    const session = this.#firestoreDB.collection('chatSessions').doc(id);
    try {
      let result;
      await this.#firestoreDB.runTransaction(async (t) => {
        const doc = await t.get(session);
        const data = doc.data();
        t.update(session,{ status: 'closed' });
        result = { id: doc.id, ...doc.data(), status: 'closed' };
      });

      return result;
    } catch (ex) {
      console.log(ex);
      return undefined;
    }
  };

  updateMessages = async (id, message, user) => {
    const session = this.#firestoreDB.collection('chatSessions').doc(id);
    try {
      let result;
      await this.#firestoreDB.runTransaction(async (t) => {
        const doc = await t.get(session);
        const data = doc.data();
        const messages = data.mensajes; 
        const users = data.users;
        const newMessages = [...messages, message];
        const newUsers = users.find((fbUser) => fbUser.userId === user.uid)
          ? users
          : [
              ...users,
              {
                avatarURL: user.photoURL || 'baseAvatar',
                userId: user.uid,
                userName: user.displayName || 'unknown',
              },
            ];
        t.update(session,{ mensajes: newMessages, users: newUsers});
        result = { id: doc.id, ...doc.data(), mensajes: newMessages };
      });
      return result;
    } catch (ex) {
      console.log(ex);
      return undefined;
    }
  };
 
}

module.exports = { ManejadorDatos };
