declare module 'y-websocket/bin/utils' {
  import * as Y from 'yjs';
  
  export function setupWSConnection(conn: any, req: any, options?: any): void;
  export function setPersistence(opts: {
    bindState: (docName: string, ydoc: Y.Doc) => Promise<void>;
    writeState: (docName: string, ydoc: Y.Doc) => Promise<void>;
  }): void;
}
