/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Server as WebSocketServer, ServerOptions } from 'ws';
import { EventEmitter } from 'cockatiel';
import { Connection } from './connection';
import { WebSocketTransport } from './transports/websocket';
import { IDisposable } from './disposable';
import { Server as HttpServer, createServer } from 'http';
import { AddressInfo } from 'net';
import { URLSearchParams } from 'url';

export interface IServerOptions {
  host: string;
  port: string;
}

/**
 * WebSocket server used to set up a CDP proxy.
 */
export class Server implements IDisposable {
  
  private TARGET_PARAMETER_NAME = "/?target";
  private wsEndpoint: string = "";
  private previousWsConnection: any = null;
  
  /**
   * Creates a new server, returning a promise that's resolved when it's opened.
   */
  public static async create(options: Partial<ServerOptions> = {}) {
    const { host = '127.0.0.1', port = 0 } = options;

    const server = createServer((_req, res) => {
      // The adapter makes an http call to discover the address to connect
      // to first. Mock that out here.
      const resolvedPort = port || (server.address() as AddressInfo).port;
      res.write(
        JSON.stringify({
          webSocketDebuggerUrl: `ws://${host}:${resolvedPort}/ws`,
        }),
      );
      res.end();
    });

    const wss = new WebSocketServer({ server });
    server.listen(port);

    return new Server(wss, server);
  }

  private readonly connectionEmitter = new EventEmitter<Connection>();

  /**
   * Emitter that fires when we get a new connection over CDP.
   */
  public readonly onConnection = this.connectionEmitter.addListener;

  /**
   * Address the server is listening on.
   */
  public readonly address = this.httpServer.address() as AddressInfo;

  public getWsEndpoint(): string {
    return this.wsEndpoint;
  }

  protected constructor(
    private readonly wss: WebSocketServer,
    private readonly httpServer: HttpServer,
  ) {
    wss.on('connection', (ws, req) => {
      if (wss.clients.size > 1 && this.previousWsConnection) {
        this.previousWsConnection.terminate();
        this.previousWsConnection = null;
      }
      
      this.previousWsConnection = ws;

      const param = new URLSearchParams(req.url);
      this.wsEndpoint = param.get(this.TARGET_PARAMETER_NAME) || "";
      this.connectionEmitter.emit(new Connection(new WebSocketTransport(ws)));
    });
  }

  /**
   * @inheritdoc
   */
  public dispose() {
    this.wss.close();
    this.httpServer.close();
  }
}
