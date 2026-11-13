# scan2skp — 라이다 스캔(OBJ) → 정리된 SketchUp 모델

라이다 메시(수십만 개 삼각형, 노이즈와 구멍)를 그대로 쓰지 않고, 벽/바닥/천장 평면과 창호를 찾아
**깨끗한 저폴리 모델로 다시 만듭니다.** 가구는 제외합니다.

## 흐름

```
scan.obj ──analyze.py──▶ model.json (+ diag_plan.png, diag_walls.png)
                          │  (필요하면 model.json을 직접 수정: 치수, 벽 두께, 창호 추가/삭제)
                          ▼
                       build.py ──▶ NAME.rb      SketchUp에서 실행하면 모델을 그리고 NAME.skp로 저장
                                    NAME.dae     SketchUp 가져오기(모든 버전)
                                    NAME_plan.png / NAME_report.md / NAME_viewer.html
```

## 실행

```bash
pip install trimesh shapely matplotlib scipy scikit-image mapbox_earcut
python3 analyze.py scan.obj -o out --thickness 150     # 위쪽 축이 Z인 파일이면 --up z
python3 build.py out/model.json -n living_room
ruby mock_sketchup.rb out/living_room.rb                 # (선택) SketchUp 없이 스크립트 오류 점검
node render.js out/living_room_viewer.html out/3d.png    # (선택) three.js 렌더, THREE_DIR=three 패키지 경로
```

테스트용 합성 스캔: `python3 make_synthetic.py test/synthetic_room.obj` (정답은 `_truth.json`)

## 모델 구성 (SketchUp)

| 그룹 | 태그 | 내용 |
|---|---|---|
| 벽체 | 벽 | 하나의 닫힌 솔리드. 바닥 윤곽(벽 안쪽 면)을 벽 두께만큼 바깥으로 오프셋, 개구부는 관통 |
| 바닥 | 바닥 | 벽 안쪽 바닥면 + 문 하부(문턱) |
| 천장 | 천장 | 평천장(최고 높이 기준) — 태그를 끄면 실내가 보임 |
| 창호 / O# | 창호 | 창: 창틀 50×70 + 유리(폭 1200 초과 시 중간 멀리언), 문: 문틀 + 문짝 |
| (치수) | 치수 | 벽 안쪽 길이 |

## model.json 주요 필드 (단위 mm, Z-up)

- `floor_polygon`: 벽 안쪽 면 기준 바닥 윤곽, **반시계 방향**. i번째 변 = 벽 `W{i+1}`
- `height`: 층고, `wall_thickness`: 기본 벽 두께, `walls[i].thickness`로 벽별 지정 가능
- `openings[]`: `wall`, `type`(window/door/opening), `offset`(벽 시작점에서 거리), `width`, `sill`(바닥에서 하단), `height`

## 한계

- 닫힌 문(벽과 같은 면)은 형상만으로는 찾기 어려움 → 확인 후 `openings`에 추가
- 가구 뒤처럼 스캔되지 않은 벽 부분은 개구부로 보지 않음(앞에 가린 물체가 있으면 제외)
- 곡면 벽, 몰딩, 다단 천장은 단순화(리포트에 다단 천장 높이 표기)
