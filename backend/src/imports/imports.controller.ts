import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportsService } from './imports.service';

@Controller('imports')
@UseGuards(EmployeeJwtGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  findAll() {
    return this.imports.findAll();
  }

  @Get(':importId')
  findOne(@Param('importId', ParseIntPipe) importId: number) {
    return this.imports.findOne(importId);
  }

  @Post()
  create(@Body() input: CreateImportDto, @Req() request: AuthenticatedRequest) {
    return this.imports.create(input, request.employee);
  }
}
