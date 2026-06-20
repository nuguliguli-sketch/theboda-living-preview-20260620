# 거실 룸 비주얼라이저 자산

매니페스트: `operator-web/rooms/manifest.json` (이 파일들을 참조).
모든 렌더는 **같은 카메라·같은 크기**(권장 1600×1067, manifest의 size와 일치)로.

## 파일럿(처음) — 사장님 렌더 5장
| 떨굴 위치 | 내용 |
|---|---|
| `base.jpg` | 기준 거실(기본 상태) |
| `floor/oak.png` | 바닥만 내추럴 오크로 바꾼 거실 전체 렌더 |
| `floor/grey.png` | 바닥만 그레이 오크 |
| `ceiling/flat.png` | 평천장 |
| `ceiling/coffered.png` | 우물천장 |

> 이름이 다르면 위 이름으로 바꿔 저장하거나, manifest의 assets 경로를 실제 파일명에 맞춰 수정.

## 부위 마스크 (시스템 작업, base 도착 후)
`zones/floor.png`, `zones/ceiling.png` … = base와 같은 크기의 PNG.
해당 부위는 **불투명(흰색)**, 나머지는 **투명**. (전체 렌더에서 그 부위만 보이게 클립하는 용도.)
- 파일럿: 기준 사진 위에 바닥/천장 영역을 손으로 칠해 만든다.
- 확장: 스케치업 "색칠 렌더"(면마다 단색·그림자 끔) 1장에서 색별로 분리해 정밀화.
- 마스크가 없으면 해당 레이어는 stage 전체를 덮으므로(클립 안 됨), 부위 마스크는 필수.

## 자재 추가(파일럿 이후)
새 자재 = `floor/<이름>.png` 추가 + `manifest.json`의 floor.assets에 `"<productId>": "rooms/living/floor/<이름>.png"` 한 줄. 제품ID는 `mock/catalog.json` 참조. (동기화 테스트가 오타를 잡아줌.)
