import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';
import { format } from 'date-fns';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
  timestamp: string;
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async chat(
    userId: string,
    userMessage: string,
    history: ChatMessage[] = [],
  ): Promise<ChatResponse> {
    const systemPrompt = await this.buildSystemPrompt(userId);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      response.choices[0]?.message?.content ??
      "I'm sorry, I couldn't generate a response.";

    this.logger.debug(`AI replied to user ${userId}: "${reply.slice(0, 80)}…"`);

    return { message: reply, timestamp: new Date().toISOString() };
  }

  // ─── Build context-rich system prompt ────────────────────────

  private async buildSystemPrompt(userId: string): Promise<string> {
    const [user, tasks, overdue, todaysTasks] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.task.findMany({
        where: {
          userId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: 20,
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          dueDate: { lt: new Date() },
        },
        take: 10,
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          scheduledStart: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
    ]);

    const todayStr = format(new Date(), 'EEEE, MMMM do yyyy');

    const taskList =
      tasks.length > 0
        ? tasks
            .map(
              (t) =>
                `- [${t.priority}] "${t.title}"${t.dueDate ? ` (due ${format(t.dueDate, 'MMM dd')})` : ''}${t.scheduledStart ? ` → scheduled ${format(t.scheduledStart, 'MMM dd HH:mm')}` : ''}`,
            )
            .join('\n')
        : 'No pending tasks.';

    const overdueList =
      overdue.length > 0
        ? overdue.map((t) => `- "${t.title}" (was due ${format(t.dueDate!, 'MMM dd')})`).join('\n')
        : 'None';

    const scheduledToday =
      todaysTasks.length > 0
        ? todaysTasks
            .map(
              (t) =>
                `- "${t.title}" at ${t.scheduledStart ? format(t.scheduledStart, 'HH:mm') : 'unscheduled'}`,
            )
            .join('\n')
        : 'Nothing scheduled today yet.';

    return `You are a compassionate AI planning assistant helping ${user?.name ?? 'the user'} manage their tasks and schedule. The user may have ADHD or executive function challenges, so be encouraging, concise, and action-oriented.

TODAY: ${todayStr}
TIMEZONE: ${user?.timezone ?? 'UTC'}
WORKING HOURS: ${user?.workStartTime ?? '09:00'} – ${user?.workEndTime ?? '17:00'}

TODAY'S SCHEDULE:
${scheduledToday}

PENDING TASKS (top 20):
${taskList}

OVERDUE TASKS:
${overdueList}

INSTRUCTIONS:
- Keep responses brief (2-4 sentences unless detail is requested)
- When suggesting tasks to focus on, explain WHY briefly
- If asked about scheduling, remind the user to use the /schedule endpoint
- Be warm, supportive, and non-judgmental
- Never make the user feel overwhelmed — break things down`;
  }
}