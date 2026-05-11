import { Model, Types } from 'mongoose';

// Use Record<string, unknown> for query/update params — compatible with all mongoose versions
type QueryFilter = Record<string, unknown>;
type UpdateOp = Record<string, unknown>;

export abstract class ScopedRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  async find(
    userId: Types.ObjectId | string,
    filter: QueryFilter = {},
    options: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number } = {},
  ): Promise<T[]> {
    return this.model
      .find({ ...filter, userId } as QueryFilter)
      .sort(options.sort)
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 0)
      .exec() as Promise<T[]>;
  }

  async findOne(userId: Types.ObjectId | string, filter: QueryFilter): Promise<T | null> {
    return this.model.findOne({ ...filter, userId } as QueryFilter).exec() as Promise<T | null>;
  }

  async findById(userId: Types.ObjectId | string, id: Types.ObjectId | string): Promise<T | null> {
    return this.model.findOne({ _id: id, userId } as QueryFilter).exec() as Promise<T | null>;
  }

  async count(userId: Types.ObjectId | string, filter: QueryFilter = {}): Promise<number> {
    return this.model.countDocuments({ ...filter, userId } as QueryFilter).exec();
  }

  async create(doc: Partial<T> & { userId: Types.ObjectId | string }): Promise<T> {
    return this.model.create(doc);
  }

  async updateOne(
    userId: Types.ObjectId | string,
    filter: QueryFilter,
    update: UpdateOp,
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate({ ...filter, userId } as QueryFilter, update, { new: true })
      .exec() as Promise<T | null>;
  }

  async upsert(
    userId: Types.ObjectId | string,
    filter: QueryFilter,
    update: UpdateOp,
  ): Promise<T> {
    return this.model
      .findOneAndUpdate({ ...filter, userId } as QueryFilter, update, { upsert: true, new: true })
      .exec() as Promise<T>;
  }

  async deleteOne(userId: Types.ObjectId | string, filter: QueryFilter): Promise<void> {
    await this.model.deleteOne({ ...filter, userId } as QueryFilter).exec();
  }
}
