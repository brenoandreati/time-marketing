import { Module } from '@nestjs/common';
import { InstagramGraphClient } from '../instagram/instagram-graph.client';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ChannelAccountsService } from './channel-accounts.service';
import { ChannelAccountsController, InstagramOAuthController } from './channels.controller';

@Module({
  imports: [WorkspacesModule],
  controllers: [ChannelAccountsController, InstagramOAuthController],
  providers: [ChannelAccountsService, InstagramGraphClient],
  exports: [ChannelAccountsService, InstagramGraphClient],
})
export class ChannelsModule {}
