import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentWorkspace, RequirePermission, WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard';
import { DashboardService } from './dashboard.service';
import { PeriodError, resolvePeriod } from './period';

@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @RequirePermission('dashboard.read')
  @Get()
  async get(@CurrentWorkspace() ws: WorkspaceContext, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const tz = await this.service.timezone(ws.id);
    let range;
    try {
      range = resolvePeriod(period, tz, { from, to });
    } catch (err) {
      if (err instanceof PeriodError) throw new BadRequestException({ code: 'invalid_period', message: err.message });
      throw err;
    }
    const [metrics, series] = await Promise.all([this.service.metrics(ws.id, range), this.service.timeseries(ws.id, range, tz)]);
    return { period: { preset: range.preset, from: range.from, to: range.to, timezone: tz }, metrics, series };
  }
}
