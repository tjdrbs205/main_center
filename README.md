# Main Center - Automated Deployment Agent

Main Center는 다수의 서버, 도커 프로젝트, 환경변수를 하나의 중앙 UI에서 관리할 수 있게 해주는 **Pull-based CD(Continuous Deployment) 컨트롤 플레인**입니다.

기존의 번거로운 Webhook 세팅 없이, 지정된 GitHub 레포지토리(GHCR)를 주기적으로(10분 간격) 폴링하여 새로운 이미지가 업로드되었을 때 자동으로 대상 서버에 배포(Pull & Up)합니다.

---

## 🚀 주요 기능 (Features)

- **Pull-Based 자동 배포**: 외부에서 Webhook을 쏠 필요가 없습니다. GitHub 레포지토리를 연결해두면, Main Center가 주기적으로 GHCR을 확인하여 새 이미지가 있을 때 스스로 배포합니다.
- **Docker Compose 기반 배포**: `docker-compose.yml` 템플릿과 `.env` 파일을 타겟 서버에 자동 생성하여 우아하게 컨테이너를 실행합니다.
- **글로벌 환경변수 관리**: 여러 프로젝트에서 공통으로 쓰이는 데이터베이스 주소, API 키 등을 전역에서 관리하고 원하는 프로젝트에 손쉽게 주입할 수 있습니다.
- **GitHub OAuth 통합**: GitHub 로그인으로 내 레포지토리 목록을 쉽게 불러오고, 전역 GHCR 인증(PAT)을 한 번만 설정해 두면 모든 프로젝트 배포에 적용됩니다.
- **Update (Self-Update)**: Main Center 자체의 업데이트가 감지되면 전역 배너를 통해 알려주며, 클릭 한 번으로 새 버전의 이미지를 당겨오고 불필요한 예전 이미지를 지우며 스스로 재시작합니다.

---

## 📦 설치 및 실행 방법 (Installation)

### 방법 1. Docker Compose로 바로 실행하기 (권장)

서버에 소스코드를 다운로드할 필요 없이, 아래의 `docker-compose.yml` 파일 하나만 만들고 실행하시면 됩니다.

1. 서버에 빈 디렉토리를 만들고 이동합니다.
2. `docker-compose.yml` 파일을 생성하고 아래 내용을 붙여넣습니다.

```yaml
version: '3.8'

services:
  main_center_agent:
    image: ghcr.io/tjdrbs205/main_center:latest
    container_name: main_center_agent
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      # 설정 및 DB 데이터를 영구 보존하기 위함
      - ./data:/app/data
      # 업데이트(Self-Update) 기능을 위해 도커 소켓 공유
      - /var/run/docker.sock:/var/run/docker.sock
```

3. 실행합니다: `docker compose up -d`

### 방법 2. 소스코드에서 직접 빌드하기

이 저장소를 직접 Clone 받아서 로컬에서 수정하며 띄우실 때 사용합니다.

```bash
git clone https://github.com/tjdrbs205/main_center.git
docker compose up -d --build
```

---

## 📖 사용 설명서 (How to use)

브라우저에서 `http://localhost:3000` 으로 접속하여 대시보드에 들어갑니다.

### 1. 전역 설정 (Settings)

- **GitHub OAuth 설정**: GitHub Developer Settings에서 OAuth App을 생성하고 Client ID와 Secret을 등록합니다. 이때 설정해야 하는 URL은 다음과 같습니다:
  - **Homepage URL**: `http://<서버IP또는도메인>:3000` (예: `http://192.168.1.10:3000`)
  - **Authorization callback URL**: `http://<서버IP또는도메인>:3000/api/github/callback` (예: `http://192.168.1.10:3000/api/github/callback`)
- **GHCR 자격 증명 (PAT)**: GitHub 패스워드 대신 Personal Access Token을 발급받아 입력합니다. (Main Center가 Private 이미지를 당겨오고 최신 다이제스트를 확인할 때 사용합니다.)

### 2. 대상 서버 등록 (Servers)

- **Servers** 탭에서 배포 대상 서버의 IP, 포트, 접속 계정 및 SSH Key(또는 비밀번호)를 등록합니다.

### 3. 환경변수 등록 (Environments)

- **Environments** 탭에서 자주 쓰는 환경변수(예: `DATABASE_URL`)를 등록해둡니다.

### 4. 프로젝트 생성 및 배포 (Projects)

- **Projects** 탭에서 **Add Project**를 누릅니다.
- 배포할 서버를 선택하고 컨테이너 설정(`docker-compose.yml`)을 작성합니다.
- **GitHub Repository** 드롭다운에서 현재 프로젝트와 연결된 GitHub 레포지토리를 선택합니다.
- **Auto Update** 옵션을 켜두면, Main Center가 10분마다 해당 레포지토리(GHCR)를 체크하여 새로운 이미지가 감지되었을 때 자동으로 배포(Pull)를 진행합니다.

### 5. 업데이트 (System Update)

- **Settings** 탭 하단의 **System Updates** 메뉴에서 Main Center 자체의 업데이트를 관리할 수 있습니다.
- 새로운 버전이 배포되면 화면 상단에 업데이트 알림 배너가 나타납니다.
- `Enable Auto Update`를 체크해두면 백그라운드에서 주기적으로 확인 후 스스로 패치됩니다.
