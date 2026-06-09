import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Project } from '../project/project.entity';

@Entity()
export class Server {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  ipOrHostname: string;

  @Column({ default: 22 })
  port: number;

  @Column()
  username: string;

  @Column({ type: 'text', nullable: true })
  privateKey: string;

  @Column({ nullable: true })
  password?: string;

  @OneToMany(() => Project, project => project.server)
  projects: Project[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
