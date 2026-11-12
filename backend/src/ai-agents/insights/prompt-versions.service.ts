import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AgentPromptVersion,
  type PromptVersionSource,
} from './prompt-insights.schemas';

const LIST_LIMIT = 30;

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

/** Historial del prompt de cada agente: se guarda el texto anterior a cada cambio. */
@Injectable()
export class PromptVersionsService {
  constructor(
    @InjectModel(AgentPromptVersion.name)
    private versionModel: Model<AgentPromptVersion>,
  ) {}

  async record(params: {
    tenantId: string | Types.ObjectId;
    agentId: string | Types.ObjectId;
    previous: string;
    source: PromptVersionSource;
    userId?: string;
    note?: string;
  }): Promise<void> {
    await this.versionModel.create({
      tenantId: oid(params.tenantId),
      agentId: oid(params.agentId),
      prompt: params.previous,
      source: params.source,
      note: params.note,
      createdBy:
        params.userId && Types.ObjectId.isValid(params.userId)
          ? oid(params.userId)
          : undefined,
    });
  }

  list(tenantId: string, agentId: string) {
    return this.versionModel
      .find({ tenantId: oid(tenantId), agentId: oid(agentId) })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .exec();
  }

  async get(
    tenantId: string,
    agentId: string,
    versionId: string,
  ): Promise<AgentPromptVersion> {
    const v = Types.ObjectId.isValid(versionId)
      ? await this.versionModel
          .findOne({
            _id: oid(versionId),
            tenantId: oid(tenantId),
            agentId: oid(agentId),
          })
          .exec()
      : null;
    if (!v) throw new NotFoundException('Versión no encontrada');
    return v;
  }
}
