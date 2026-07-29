import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { AssignStoresDto } from './dto/assign-stores.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserService } from './user.service';

@ApiTags('User')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List users, newest first (super admin only)' })
  findAll(@Query() query: QueryUserDto, @CurrentUser() user: JwtPayload) {
    return this.userService.findAll(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Account counts by status (super admin only)' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.userService.getStats(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one user with their store links (super admin only)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.findOne(id, user);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a pending sign-up — PENDING → ACTIVE (super admin only)' })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.approve(id, user);
  }

  @Patch(':id/suspend')
  @ApiOperation({
    summary: 'Reject a sign-up or suspend an account, revoking its session (super admin only)',
  })
  suspend(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.suspend(id, user);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: "Change a user's role (super admin only)" })
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.updateRole(id, dto, user);
  }

  @Patch(':id/assigned-stores')
  @ApiOperation({
    summary:
      'Replace the stores an assessor may assess — full list, not a delta (super admin only)',
  })
  assignStores(
    @Param('id') id: string,
    @Body() dto: AssignStoresDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.assignStores(id, dto, user);
  }

  @Patch(':id/owned-stores')
  @ApiOperation({
    summary: 'Replace the stores an entrepreneur owns — full list, not a delta (super admin only)',
  })
  assignOwnedStores(
    @Param('id') id: string,
    @Body() dto: AssignStoresDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.assignOwnedStores(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user with no assessments and no owned stores' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.userService.remove(id, user);
    return null;
  }
}
