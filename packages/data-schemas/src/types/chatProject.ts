import type { AgentToolResources, EToolResources } from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

export interface IChatProject {
  _id?: Types.ObjectId;
  name: string;
  description?: string;
  user: string;
  conversationCount: number;
  lastConversationAt?: Date | null;
  lastConversationId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
  /** Project knowledge: full-text context files available to every chat in this project. */
  tool_resources?: Pick<AgentToolResources, EToolResources.context>;
}

export interface IChatProjectDocument extends Omit<IChatProject, '_id'>, Document {}
