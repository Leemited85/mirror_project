# Garment Rig Format

리깅 가능한 의류 자산은 `GarmentAsset.rig` 필드에 저장한다. 목적은 단일 PNG를 바로 얹는 대신, 파트와 앵커를 기준으로 실시간 추적 렌더를 가능하게 하는 것이다.

## 구조

```json
{
  "version": "1.0",
  "render_mode": "segmented-2d",
  "anchors": {
    "neck": { "x": 0.5, "y": 0.16 },
    "left_shoulder": { "x": 0.31, "y": 0.22 },
    "right_shoulder": { "x": 0.69, "y": 0.22 },
    "left_hip": { "x": 0.38, "y": 0.79 },
    "right_hip": { "x": 0.62, "y": 0.79 },
    "left_elbow": { "x": 0.17, "y": 0.50 },
    "right_elbow": { "x": 0.83, "y": 0.50 },
    "left_wrist": { "x": 0.14, "y": 0.93 },
    "right_wrist": { "x": 0.86, "y": 0.93 }
  },
  "parts": [
    {
      "id": "torso",
      "role": "torso",
      "source_rect": { "x": 0.22, "y": 0.16, "width": 0.56, "height": 0.80 },
      "pivot": { "x": 0.5, "y": 0.12 },
      "depth": 10,
      "scale_multiplier": 1.08,
      "rotation_offset_deg": 0
    }
  ]
}
```

## 필드 설명

- `anchors`: 의류 원본 이미지 안에서 기준 관절이 어디에 있는지 나타내는 정규화 좌표
- `parts`: 실시간 렌더 시 따로 움직일 조각 목록
- `source_rect`: 원본 의류 이미지에서 잘라 쓸 영역
- `pivot`: 해당 파트의 회전 기준점
- `depth`: 파트 렌더 순서
- `anchor_start`, `anchor_end`: 사람 랜드마크에 파트를 연결할 때 사용할 시작/끝 점
- `scale_multiplier`: 기본 길이 대비 파트 보정 배율
- `rotation_offset_deg`: 기본 회전에 더할 추가 각도

## 현재 렌더링 규칙

- `torso`: 목, 어깨, 골반 기준으로 몸통 박스를 계산해 렌더
- `left_sleeve`, `right_sleeve`: 어깨에서 손목까지 길이와 각도로 회전/확장
- `hood`: 목 기준으로 몸통 상단에 따라붙는 보조 파트

## 한계

현재 MVP는 실제 3D 메시가 아니라 `segmented-2d` 방식이다. 자연스러운 가림 처리, 깊이, 천 주름은 이후 단계에서 세그멘테이션과 생성형 모델로 보강해야 한다.
