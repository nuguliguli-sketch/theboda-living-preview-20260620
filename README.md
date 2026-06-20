# 더보다 플랫폼 — 운영 백오피스(정적)

운영자가 로그인해 고객·프로젝트 생성, 현장 사진 업로드·정리·승인을 하는 정적 웹.
바닐라 JS(ESM, 빌드 없음). 채비 방식 재사용. 설계서 `docs/2026-06-03-operator-backoffice-design.md`.

## 구조
- `index.html` + `styles.css`(더보다 토큰)
- `js/env.js` 설정 · `js/api.js` API · `js/auth.js` Cognito SRP · `js/router.js` 해시 라우팅 · `js/ui.js` DOM 헬퍼
- `js/views/*` 로그인·고객·프로젝트·프로젝트 상세 · `js/app.js` 부트스트랩

## 개발
- 설치: `npm install`
- 단위 테스트(로직): `npm test`
- 로컬 실행: `npm run serve` 후 `http://localhost:5500` (또는 임의 정적 서버)

## 설정 (배포 전 필수)
`js/env.js`의 `REPLACE_*`를 실제 값으로 교체:
- `apiBaseUrl`: 배포된 HttpApi URL(스택 Output `ApiUrl`)
- `tenantId`: 운영 대상 업체 ID(도그푸딩=채비)
- `cognito.userPoolId`/`clientId`: 스택 Output `UserPoolId` + UserPoolClient ID

## 인증
운영 계정은 관리자가 Cognito 풀에 수동 생성 후, 해당 tenantId에 TenantMembership(active) 부여.
로그인은 SRP(비밀번호 서버 전송 없음). 토큰은 sessionStorage(탭 닫으면 만료).

## 배포 (사용자 승인 필요)
정적 파일을 AWS Amplify(또는 S3+CloudFront)에 호스팅. 백엔드 SAM 배포(`backend`)가 선행.
CORS: 백엔드 `AllowedOrigins`에 이 사이트 오리진 추가.
