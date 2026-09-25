import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesService } from '../roles/roles.service';
import { ProspectingController } from './prospecting.controller';
import { ProspectingService } from './prospecting.service';

describe('ProspectingController (HTTP)', () => {
  let app: INestApplication<App>;
  let role = 'TENANT_ADMIN';
  let modules = ['leads'];
  const service = {
    createSearch: jest.fn((_t: string, _u: string, dto: unknown) => dto),
    queueResearch: jest.fn(() => ({ queued: 1 })),
    findProspect: jest.fn(() => ({ _id: 'p' })),
    removeSearch: jest.fn(() => ({ ok: true })),
    updateProspect: jest.fn((_id: string, _t: string, dto: unknown) => dto),
    toLead: jest.fn(() => ({ leadId: 'l' })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ProspectingController],
      providers: [
        { provide: ProspectingService, useValue: service },
        {
          provide: RolesService,
          useValue: {
            accessFor: () => Promise.resolve({ modules, actions: {} }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ user: unknown }>().user = {
            userId: 'u1',
            tenantId: 't1',
            role,
            email: 'a@b.c',
            localIds: [],
          };
          return true;
        },
      })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    role = 'TENANT_ADMIN';
    modules = ['leads'];
  });

  it('crea una búsqueda validando y limpiando el cuerpo', async () => {
    await request(app.getHttpServer())
      .post('/prospecting/searches')
      .send({ services: 'Webs', maxResults: 20, hack: true })
      .expect(201);
    expect(service.createSearch).toHaveBeenCalledWith('t1', 'u1', {
      services: 'Webs',
      maxResults: 20,
    });
  });

  it('rechaza búsquedas sin servicios o con demasiados resultados', async () => {
    await request(app.getHttpServer())
      .post('/prospecting/searches')
      .send({ services: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/prospecting/searches')
      .send({ services: 'x', maxResults: 500 })
      .expect(400);
    expect(service.createSearch).not.toHaveBeenCalled();
  });

  it('enruta la investigación masiva sin confundirla con un id', async () => {
    await request(app.getHttpServer())
      .post('/prospecting/prospects/research')
      .send({ ids: ['a', 'b'] })
      .expect(201, { queued: 1 });
    expect(service.queueResearch).toHaveBeenCalledWith(['a', 'b'], 't1');
    await request(app.getHttpServer())
      .post('/prospecting/prospects/research')
      .send({ ids: [] })
      .expect(400);
  });

  it('valida el estado del prospecto', async () => {
    await request(app.getHttpServer())
      .patch('/prospecting/prospects/p1')
      .send({ status: 'raro' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/prospecting/prospects/p1')
      .send({ status: 'contacted' })
      .expect(200);
  });

  // La etapa es del embudo del tenant: aquí solo se exige texto; que exista lo
  // comprueba LeadsService.create.
  it('valida la etapa del seguimiento', async () => {
    await request(app.getHttpServer())
      .post('/prospecting/prospects/p1/lead')
      .send({ stage: 123 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/prospecting/prospects/p1/lead')
      .send({ stage: 'contacted', value: 100, personIndex: 0 })
      .expect(201);
  });

  it('exige el módulo de seguimiento', async () => {
    modules = ['customers'];
    await request(app.getHttpServer())
      .get('/prospecting/prospects/p1')
      .expect(403);
  });

  it('solo gerencia elimina búsquedas', async () => {
    role = 'MARKETING';
    await request(app.getHttpServer())
      .delete('/prospecting/searches/s1')
      .expect(403);
    role = 'MANAGER';
    await request(app.getHttpServer())
      .delete('/prospecting/searches/s1')
      .expect(200);
  });
});
