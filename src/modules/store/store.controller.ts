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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { BadRequestException } from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto, UpdateStoreStatusDto, RemovePhotoDto } from './dto/update-store.dto';
import { QueryStoreDto } from './dto/query-store.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DOCUMENT_MIME_REGEX =
  /^(image\/(jpeg|png|webp)|application\/(pdf|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))$/;
const PHOTO_MIME_REGEX = /^image\/(jpeg|png|webp)$/;

function fileExceptionFactory(error: string) {
  return error.toLowerCase().includes('size')
    ? new BadRequestException(ERROR_CODES.FILE.TOO_LARGE, 'File exceeds the 10 MB limit')
    : new BadRequestException(ERROR_CODES.FILE.INVALID_TYPE, 'File type is not allowed');
}

@ApiTags('Stores')
@ApiBearerAuth()
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @ApiOperation({
    summary: 'List stores (paginated, filterable; ENTREPRENEUR only sees their own)',
  })
  findAll(@Query() query: QueryStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.findAll(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate store stats for the dashboard' })
  getStats() {
    return this.storeService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a store by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.storeService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a store (ADMIN, or ENTREPRENEUR for their own store)' })
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a store (ADMIN, or ENTREPRENEUR for their own store)' })
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: "Update a store's status (ADMIN only)" })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStoreStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.updateStatus(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a store (ADMIN only)' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.storeService.remove(id, user);
    return null;
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Upload a document for a store (stored on local disk)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: DOCUMENT_MIME_REGEX }),
        ],
        exceptionFactory: fileExceptionFactory,
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.uploadDocument(id, file, user);
  }

  @Delete(':id/documents/:documentId')
  @ApiOperation({ summary: 'Delete a document (removes DB row and local file)' })
  async removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.storeService.removeDocument(id, documentId, user);
    return null;
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload a menu photo for a store (stored on local disk)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: PHOTO_MIME_REGEX }),
        ],
        exceptionFactory: fileExceptionFactory,
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.uploadPhoto(id, file, user);
  }

  @Delete(':id/photos')
  @ApiOperation({ summary: 'Delete a menu photo by url' })
  removePhoto(
    @Param('id') id: string,
    @Body() dto: RemovePhotoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.removePhoto(id, dto.url, user);
  }

  @Post(':id/logo')
  @ApiOperation({ summary: 'Upload (replace) a store logo (stored on local disk)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: PHOTO_MIME_REGEX }),
        ],
        exceptionFactory: fileExceptionFactory,
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.uploadLogo(id, file, user);
  }

  @Delete(':id/logo')
  @ApiOperation({ summary: 'Remove the store logo' })
  removeLogo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.storeService.removeLogo(id, user);
  }

  @Post(':id/storefront-photos')
  @ApiOperation({ summary: 'Upload a storefront photo for a store (stored on local disk)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadStorefrontPhoto(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: PHOTO_MIME_REGEX }),
        ],
        exceptionFactory: fileExceptionFactory,
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.uploadStorefrontPhoto(id, file, user);
  }

  @Delete(':id/storefront-photos')
  @ApiOperation({ summary: 'Delete a storefront photo by url' })
  removeStorefrontPhoto(
    @Param('id') id: string,
    @Body() dto: RemovePhotoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.removeStorefrontPhoto(id, dto.url, user);
  }
}
