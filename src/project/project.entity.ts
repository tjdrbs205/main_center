import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, ManyToMany, JoinTable } from 'typeorm';
import { Server } from '../server/server.entity';
import { Environment } from '../environment/environment.entity';
import { Registry } from '../registry/registry.entity';

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

  @Column()
  webhookToken: string;

  @Column({ type: 'text', nullable: true })
  composeYaml: string;

  @ManyToOne(() => Server, server => server.projects, { onDelete: 'SET NULL' })
  server: Server;

  @ManyToOne(() => Registry, { onDelete: 'SET NULL', nullable: true })
  registry: Registry;

  @ManyToMany(() => Environment)
  @JoinTable()
  environments: Environment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
