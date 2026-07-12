import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL ?? '*',
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  // userId → Set of socketIds
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  // ─── Connection ────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new UnauthorizedException('No token provided');

      const payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });

      client.userId = payload.sub as string;

      // Track socket
      if (!this.userSockets.has(client.userId)) {
        this.userSockets.set(client.userId, new Set());
      }
      this.userSockets.get(client.userId)!.add(client.id);

      // Join personal room
      await client.join(`user:${client.userId}`);

      this.logger.log(`Client connected: ${client.id} (user: ${client.userId})`);
      client.emit('connected', { message: 'Connected to AI Planner' });
    } catch {
      this.logger.warn(`Unauthorized connection attempt: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      sockets?.delete(client.id);
      if (sockets?.size === 0) this.userSockets.delete(client.userId);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Events from clients ──────────────────────────────────────

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // ─── Server-side emit helpers ─────────────────────────────────

  /** Emit an event to all sockets belonging to a specific user */
  sendToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /** Emit task:updated event */
  broadcastTaskUpdate(userId: string, task: unknown) {
    this.sendToUser(userId, 'task:updated', task);
  }

  /** Emit calendar:updated event */
  broadcastCalendarUpdate(userId: string, event: unknown) {
    this.sendToUser(userId, 'calendar:updated', event);
  }

  /** Emit scheduling:suggestion event */
  broadcastSchedulingSuggestion(userId: string, suggestion: unknown) {
    this.sendToUser(userId, 'scheduling:suggestion', suggestion);
  }
}
