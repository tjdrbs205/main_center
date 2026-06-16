import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, ManyToMany, JoinTable } from 'typeorm';
import { Server } from '../server/server.entity';
import { Environment } from '../environment/environment.entity';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  dockerImage: string;

  @Column()
  containerName: string;

  @Column({ nullable: true })
  githubRepo: string;

  @Column({ default: false })
  autoUpdate: boolean;

  @Column({ nullable: true })
  lastImageDigest: string;

  @Column({ default: false })
  updateAvailable: boolean;

  @Column()
  webhookToken: string;

  @Column({ type: 'text', nullable: true })
  composeYaml: string;

  @ManyToOne(() => Server, server => server.projects, { onDelete: 'SET NULL' })
  server: Server;


  @ManyToMany(() => Environment)
  @JoinTable()
  environments: Environment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
