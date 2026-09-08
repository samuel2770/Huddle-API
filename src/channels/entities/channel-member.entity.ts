import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Channel } from './channel.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Message } from '../../messages/entities/message.entity.js';

@Entity('channel_members')
@Unique(['channel_id', 'user_id'])
export class ChannelMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  channel_id: string;

  @ManyToOne(() => Channel, (channel) => channel.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.channelMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  last_read_message_id: string | null;

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_read_message_id' })
  lastReadMessage: Message | null;

  @Column({ type: 'int', default: 0 })
  unread_count: number;

  @CreateDateColumn({ type: 'timestamp' })
  joined_at: Date;
}
