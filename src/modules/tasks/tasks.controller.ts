import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User, TaskStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@CurrentUser() user: User, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tasks with optional filters' })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'dueBefore', required: false, type: String })
  @ApiQuery({ name: 'dueAfter', required: false, type: String })
  findAll(
    @CurrentUser() user: User,
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
  ) {
    return this.tasksService.findAll(user.id, {
      status,
      priority,
      dueBefore,
      dueAfter,
    });
  }

  @Get('today')
  @ApiOperation({ summary: "Get today's scheduled & due tasks" })
  getToday(@CurrentUser() user: User) {
    return this.tasksService.getTodaysTasks(user.id);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Get all overdue tasks' })
  getOverdue(@CurrentUser() user: User) {
    return this.tasksService.getOverdue(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.tasksService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update task fields' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, user.id, dto);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark task as completed' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.tasksService.complete(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.tasksService.remove(id, user.id);
  }
}