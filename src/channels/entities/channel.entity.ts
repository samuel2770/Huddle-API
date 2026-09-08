import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { ChannelMember } from './channel-member.entity.js';
import { Message } from '../../messages/entities/message.entity.js';

export enum ChannelType {
  PUBLIC = 'public',
  PRIVATE = 'private',
  DM = 'dm',
}

@Entity('channels')
@Unique(['workspace_id', 'name'])
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspace_id: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.channels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({
    type: 'enum',
    enum: ChannelType,
    default: ChannelType.PUBLIC,
  })
  type: ChannelType;

  @Column({ type: 'uuid' })
  created_by: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: 'boolean', default: false })
  is_archived: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => ChannelMember, (member) => member.channel, { cascade: true })
  members: ChannelMember[];

  @OneToMany(() => Message, (message) => message.channel)
  messages: Message[];
}
