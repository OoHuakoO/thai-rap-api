import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { BadRequestException } from '@common/exceptions/app.exception';
import {
  ERROR_CODES,
  FILE_MAX_SIZE_BYTES,
  FILE_MAX_SIZE_MB,
  PHOTO_MIME_REGEX,
} from '@constants/index';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivityDto } from './dto/query-activity.dto';
import { UpdateActivityDto, UpdateActivityPhotoDto } from './dto/update-activity.dto';

// One album upload at a time; a bigger batch is several calls, which is also
// how the browser reports progress on them.
const ACTIVITY_PHOTO_MAX_PER_REQUEST = 20;

function fileExceptionFactory(error: string) {
  return error.toLowerCase().includes('size')
    ? new BadRequestException(ERROR_CODES.FILE.TOO_LARGE, `ไฟล์มีขนาดเกิน ${FILE_MAX_SIZE_MB} MB`)
    : new BadRequestException(ERROR_CODES.FILE.INVALID_TYPE, 'ประเภทไฟล์นี้ไม่อนุญาต');
}

@ApiTags('Activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @ApiOperation({
    summary: 'List activity albums, newest activity date first (every signed-in role)',
  })
  findAll(@Query() query: QueryActivityDto) {
    return this.activityService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one activity album with all its photos (every signed-in role)' })
  findOne(@Param('id') id: string) {
    return this.activityService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an activity album (admin / super admin only)' })
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: JwtPayload) {
    return this.activityService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an activity album (admin / super admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateActivityDto, @CurrentUser() user: JwtPayload) {
    return this.activityService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an activity album and every photo file behind it (admin / super admin only)',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.activityService.remove(id, user);
    return null;
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload activity photos (admin / super admin only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
      required: ['files'],
    },
  })
  @UseInterceptors(FilesInterceptor('files', ACTIVITY_PHOTO_MAX_PER_REQUEST))
  addPhotos(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: FILE_MAX_SIZE_BYTES }),
          new FileTypeValidator({ fileType: PHOTO_MIME_REGEX }),
        ],
        exceptionFactory: fileExceptionFactory,
      }),
    )
    files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.activityService.addPhotos(id, files, user);
  }

  @Patch(':id/photos/:photoId')
  @ApiOperation({ summary: 'Reorder a photo within its album (admin / super admin only)' })
  updatePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Body() dto: UpdateActivityPhotoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.activityService.updatePhoto(id, photoId, dto, user);
  }

  @Delete(':id/photos/:photoId')
  @ApiOperation({
    summary: 'Delete one activity photo and its file (admin / super admin only)',
  })
  async removePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.activityService.removePhoto(id, photoId, user);
    return null;
  }
}
