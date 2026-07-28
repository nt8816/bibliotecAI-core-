import { Client, Account, Databases, Storage, Query, ID, Permission, Role } from 'appwrite';

const APPWRITE_ENDPOINT = String(import.meta.env.VITE_APPWRITE_ENDPOINT || '').trim();
const APPWRITE_PROJECT_ID = String(import.meta.env.VITE_APPWRITE_PROJECT_ID || '').trim();

let client = null;
let account = null;
let databases = null;
let storage = null;

function getClient() {
  if (!client) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
      throw new Error('Appwrite nao configurado. Defina VITE_APPWRITE_ENDPOINT e VITE_APPWRITE_PROJECT_ID.');
    }

    client = new Client();
    client
      .setEndpoint(APPWRITE_ENDPOINT)
      .setProject(APPWRITE_PROJECT_ID);

    account = new Account(client);
    databases = new Databases(client);
    storage = new Storage(client);
  }

  return { client, account, databases, storage };
}

export function getAppwriteAccount() {
  return getClient().account;
}

export function getAppwriteDatabases() {
  return getClient().databases;
}

export function getAppwriteStorage() {
  return getClient().storage;
}

export function setAppwriteSession(jwt) {
  const { client: c } = getClient();
  c.setJWT(jwt);
}

export function clearAppwriteSession() {
  const { client: c } = getClient();
  c.setJWT('');
}

export function getAppwriteClient() {
  try {
    return getClient().client;
  } catch {
    return null;
  }
}

export { Query, ID, Permission, Role };
