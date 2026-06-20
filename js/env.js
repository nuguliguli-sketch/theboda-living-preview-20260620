// 호스트명 → 환경 설정. 실제 값은 배포 시 채운다(placeholder는 dev 기본).
const CONFIGS = {
  dev: {
    stage: "dev",
    apiBaseUrl: "https://ynke0uekog.execute-api.ap-northeast-2.amazonaws.com/dev",
    tenantId: "t_01KT5F9Q7794H8V2S56PVMEANT",
    cognito: { region: "ap-northeast-2", userPoolId: "ap-northeast-2_FDV2qdE6d", clientId: "7lp9ts5udq6dqs43507513o4i2" },
  },
  prod: {
    stage: "prod",
    apiBaseUrl: "https://REPLACE-prod.execute-api.ap-northeast-2.amazonaws.com/prod",
    tenantId: "REPLACE_TENANT_ID",
    cognito: { region: "ap-northeast-2", userPoolId: "REPLACE_POOL_ID", clientId: "REPLACE_CLIENT_ID" },
  },
};

export function resolveConfig(hostname) {
  const h = hostname || "";
  if (h.includes("operator.theboda") && !h.includes("dev")) return CONFIGS.prod;
  return CONFIGS.dev; // localhost·dev·미지정 전부 dev
}

export const config = resolveConfig(typeof location !== "undefined" ? location.hostname : "");
