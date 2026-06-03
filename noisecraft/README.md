# NoiseCraft Server

NoiseCraft 오디오 합성 서버입니다. Web Audio API 기반의 실시간 오디오 생성 및 프로젝트 저장 기능을 제공합니다.

## 기능

- 실시간 오디오 합성
- 프로젝트 파일 (.ncft) 저장/로드
- 예시 프로젝트 제공
- WebSocket을 통한 실시간 오디오 스트리밍

## 개발

```bash
yarn install
yarn start
```

## 프로젝트 파일

예시 프로젝트는 `examples/` 폴더에 있습니다:

- `indiv_audio_map_v2.ncft`: 개인 뷰용 오디오 패치
- `glb_audio_map.ncft`: 글로벌 뷰용 오디오 패치

## 환경 변수

- `PORT`: 서버 포트 (기본값: 4000)
- `HOST`: 바인딩 주소 (기본값: 0.0.0.0)
- `NODE_ENV`: 환경 모드 (development/production)
- `DB_FILE_PATH`: 데이터베이스 파일 경로 (기본값: ./database.db)

## 배포

Render에서 배포 시 `render.yaml` 파일을 사용하거나 수동으로 설정:

- Root Directory: `noisecraft`
- Build Command: `yarn install`
- Start Command: `yarn start`
