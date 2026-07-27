import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { CreateNewsDto } from './dto/create-news.dto';
import { QueryNewsDto } from './dto/query-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsService } from './news.service';

@ApiTags('News')
@ApiBearerAuth()
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @ApiOperation({
    summary: 'List announcements, newest first with urgent items pinned (admin / super admin only)',
  })
  findAll(@Query() query: QueryNewsDto, @CurrentUser() user: JwtPayload) {
    return this.newsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single announcement (admin / super admin only)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.newsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Publish an announcement (admin / super admin only)' })
  create(@Body() dto: CreateNewsDto, @CurrentUser() user: JwtPayload) {
    return this.newsService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an announcement (admin / super admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateNewsDto, @CurrentUser() user: JwtPayload) {
    return this.newsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an announcement (admin / super admin only)' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.newsService.remove(id, user);
    return null;
  }
}
