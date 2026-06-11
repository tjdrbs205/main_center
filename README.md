# Main Center - Automated Deployment Agent

Main Center는 SSH 기반의 미니 CD(Continuous Deployment) 컨트롤 플레인으로, 다수의 서버, 도커 프로젝트, 환경변수, 그리고 비공개 레지스트리(Private Registry) 인증 정보를 하나의 중앙 UI에서 관리할 수 있게 해줍니다.

GitHub Actions와 같은 CI 도구에서 Webhook을 쏘면, Main Center가 타겟 서버에 접속하여 자동으로 `.env` 파일과 `docker-compose.yml`을 세팅하고 최신 버전으로 배포합니다.

---

## 🚀 주요 기능 (Features)

- **Docker Compose 기반 배포**: 복잡한 인프라도 `docker-compose.yml` 템플릿과 `.env` 파일을 타겟 서버에 자동 생성하여 우아하게 띄웁니다.
- **글로벌 환경변수 관리**: 여러 프로젝트에서 공통으로 쓰이는 데이터베이스 주소, 시크릿 키 등을 전역에서 관리하고 원하는 프로젝트에 손쉽게 주입할 수 있습니다.
- **Private Registry 자동 로그인**: GHCR, DockerHub 등 비공개 레지스트리의 인증 토큰을 저장해두면, 배포 시 대상 서버에서 자동으로 `docker login`을 수행하여 이미지를 안전하게 가져옵니다.
- **Webhook 통합**: 각 프로젝트마다 발급되는 고유 토큰을 통해 GitHub Actions 등에서 1줄짜리 CURL 명령어로 배포를 트리거할 수 있습니다.
- **Self-Update (자가 업데이트)**: Main Center 자신의 소스코드가 변경되었을 때, 재부팅 없이 도커 소켓을 통해 스스로 새 버전의 이미지를 당겨오고 재시작하는 자가 진화 기능을 내장하고 있습니다.

---

## 📦 설치 및 실행 방법 (Installation)

Main Center를 서버에 띄우는 방법은 두 가지가 있습니다.

### 방법 1. 빌드된 이미지만 다운받아서 실행하기 (권장)
서버에 소스코드를 다운로드할 필요 없이, 아래의 `docker-compose.yml` 파일 하나만 만들고 실행하시면 됩니다.

1. 서버에 빈 디렉토리를 만들고 이동합니다.
2. `docker-compose.yml` 파일을 생성하고 아래 내용을 붙여넣습니다.
```yaml
version: '3.8'

services:
  main_center_agent:
    image: ghcr.io/유저명/레포지토리명:latest   # 빌드된 이미지가 올라간 주소로 변경해주세요
    container_name: main_center_agent
    restart: unless-stopped
    environment:
      # 자가 업데이트(Self-Update) API를 보호하기 위한 비밀번호입니다. 마음대로 지정하세요.
      - AGENT_SECRET_TOKEN=my_super_secret_token
    ports:
      - "3000:3000"
    volumes:
      # 설정 및 DB 데이터를 영구 보존하기 위함
      - ./data:/app/data
      # 자가 업데이트 기능을 위해 도커 소켓 공유
      - /var/run/docker.sock:/var/run/docker.sock
```
3. 실행합니다: `docker compose up -d`

### 방법 2. 소스코드에서 직접 빌드하기
이 저장소를 직접 Clone 받아서 로컬에서 수정하며 띄우실 때 사용합니다.
```bash
git clone https://github.com/.../main_center.git
cd main_center/backend
docker compose up -d --build
```

---

## 📖 사용 설명서 (How to use)

브라우저에서 `http://서버IP:3000` 으로 접속하여 대시보드에 들어갑니다.

### 1. 서버 등록 (Target Servers)
- **Servers** 탭에서 대상 서버의 IP, 포트, 접속 계정 및 SSH Key(또는 비밀번호)를 등록합니다.
- Main Center는 배포가 발생할 때 이 정보를 이용해 대상 서버에 SSH로 접근합니다.

### 2. 환경변수 풀 등록 (Global Environments)
- **Environments** 탭에서 자주 쓰는 환경변수(예: `DATABASE_URL`, `REDIS_HOST`)를 등록해둡니다.

### 3. 도커 레지스트리 등록 (Registries)
- 비공개(Private) 도커 이미지를 사용하신다면 **Registries** 탭에 레지스트리 URL(예: `ghcr.io`), 유저명, 그리고 비밀번호(또는 GitHub PAT)를 등록해둡니다.

### 4. 프로젝트 생성 (Projects & Envs)
- **Projects** 탭에서 **Add Project**를 누릅니다.
- 배포할 타겟 서버와, 필요하다면 사용할 Registry를 선택합니다.
- 해당 프로젝트의 **`docker-compose.yml`** 내용을 직접 에디터에 작성합니다. (환경변수 주입을 위해 `env_file: [".env"]`를 꼭 포함하세요!)
- 방금 만들어둔 전역 환경변수를 프로젝트에 연결합니다.
- 저장하면 프로젝트 전용 **Webhook Token**이 발급됩니다.

### 5. GitHub Action 연결 (CI/CD)
- **Integration Guide** 버튼을 누르면 GitHub Actions용 배포 템플릿 코드가 생성됩니다.
- 본인의 서비스 레포지토리 `.github/workflows/deploy.yml` 파일 마지막 줄에 이 코드를 붙여넣기만 하면, 소스 코드가 Push될 때마다 Main Center가 타겟 서버에 접속해 자동으로 배포를 수행합니다.

---

## 🔧 자가 업데이트 (Self-Update) 작동 원리
대시보드의 **Settings** 탭에서 Update Agent 버튼을 누르거나, 아래와 같이 Webhook을 쏘면 작동합니다.

```bash
curl -X POST https://MAIN_CENTER_URL/self-update \
  -H "Authorization: Bearer <AGENT_SECRET_TOKEN>"
```

**동작 흐름:**
1. 현재 컨테이너가 띄워질 때 사용되었던 볼륨 경로, 포트 매핑 등을 스캔합니다.
2. 백그라운드에서 호스트 머신의 도커 엔진에 직접 명령을 내려 새로운 이미지를 `pull` 받습니다.
3. 스스로 기존 컨테이너를 종료 및 삭제(`docker rm`)한 뒤, 1번에서 복사해둔 설정과 완벽하게 동일한 옵션으로 새 버전의 자신을 띄웁니다. (새 컨테이너는 원래 `docker-compose.yml`이 아닌 `docker run` 명령어로 실행되지만 모든 기능과 볼륨이 동일하게 유지됩니다.)
