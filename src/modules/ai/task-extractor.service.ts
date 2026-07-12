import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { addDays, endOfWeek, startOfToday } from 'date-fns';

export interface ExtractedTask {
  title: string;
  estimatedDuration?: number;   // minutes
  dueDate?: string;             // ISO date string
  businessHoursStart?: string;  // HH:mm
  businessHoursEnd?: string;    // HH:mm
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tags?: string[];
  description?: string;
}

const EXTRACTION_SCHEMA = {
  name: 'extract_task',
  description: 'Extract structured task information from user free text',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, clear task title (e.g. "Car Inspection")',
      },
      estimatedDuration: {
        type: 'number',
        description: 'Estimated task duration in minutes',
      },
      dueDate: {
        type: 'string',
        description:
          'ISO 8601 due date. Use relative expressions like "this week" = end of current week. Today = ' +
          startOfToday().toISOString(),
      },
      businessHoursStart: {
        type: 'string',
        description: 'Opening/business hours start in HH:mm format, if mentioned',
      },
      businessHoursEnd: {
        type: 'string',
        description: 'Opening/business hours end in HH:mm format, if mentioned',
      },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        description: 'Inferred priority from urgency language',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relevant category tags',
      },
      description: {
        type: 'string',
        description: 'Any additional details extracted from the text',
      },
    },
    required: ['title'],
  },
} as const;

@Injectable()
export class TaskExtractorService {
  private readonly logger = new Logger(TaskExtractorService.name);
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async extract(text: string): Promise<ExtractedTask> {
    this.logger.debug(`Extracting task from text: "${text.slice(0, 80)}…"`);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant that extracts structured task information from natural language.
Today's date: ${new Date().toISOString()}
End of this week: ${endOfWeek(new Date()).toISOString()}
Next week end: ${endOfWeek(addDays(new Date(), 7)).toISOString()}
Extract as much detail as possible. Be conservative with priority — default to MEDIUM unless urgency is clearly stated.`,
          },
          { role: 'user', content: text },
        ],
        tools: [{ type: 'function', function: EXTRACTION_SCHEMA as any }],
        tool_choice: { type: 'function', function: { name: 'extract_task' } },
        temperature: 0.1,
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new BadRequestException('AI could not extract task from text');

      const extracted = JSON.parse(toolCall.function.arguments) as ExtractedTask;
      this.logger.log(`Task extracted: "${extracted.title}"`);
      return extracted;
    } catch (error) {
      this.logger.error('Task extraction failed', error);
      throw new BadRequestException('Could not extract task from text. Please try rephrasing.');
    }
  }
}