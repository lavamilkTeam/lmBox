<h1 align="center">
  <img src="docs/images/lmbox-logo-pig.png" alt="" width="72" height="72" align="absmiddle">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/lmbox-wordmark-dark.svg">
    <img src="docs/images/lmbox-wordmark.svg" alt="lmBox" width="190" height="80" align="absmiddle">
  </picture>
</h1>

<p align="center">
  <a href="README.md">English</a> · <strong>한국어</strong> · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">전자 부품과 유체 등 다양한 분야를 위한 산업 설계·시뮬레이션 플랫폼을 개발합니다. 광학 기능은 향후 제공할 예정입니다.</p>

<p align="center">
  <a href="package.json"><img src="docs/badges/version.svg" alt="버전 0.1.0" height="28"></a>
  <a href="LICENSE"><img src="docs/badges/license.svg" alt="라이선스: 자체 비상업용 라이선스" height="28"></a>
  <a href="https://lavamilk.club"><img src="docs/badges/website.svg" alt="공식 웹사이트: lavamilk.club" height="28"></a>
</p>

<p align="center"><sub>자체 소스 공개 라이선스를 사용합니다. 상업적 이용은 금지되며, 파생물을 배포하거나 네트워크 서비스로 제공할 경우 동일한 라이선스로 소스 코드를 공개해야 합니다.<br>사용 전에 <a href="LICENSE">LICENSE</a>를 읽고 조건을 확인하여 라이선스 관련 위험을 피하세요. 중국어 원문이 공식 라이선스입니다.</sub></p>

<p align="center"><img src="docs/images/workflow.png" alt="lmBox 기능 라이브러리와 워크플로 캔버스" width="1000"></p>

<p align="center"><strong>산업 설계 작업 공간</strong><br><sub>기능 라이브러리에서 도구를 선택하고 워크플로 캔버스에서 작업 공간을 구성합니다.</sub></p>

<p align="center"><img src="docs/images/cfd-flow.jpg" alt="lmBox의 737 CFD 사례에서 표시한 압력, 메시와 유선" width="1000"></p>

<p align="center"><strong>CFD 시뮬레이션 결과</strong><br><sub>실제로 계산한 737 사례의 압력 분포, 표면 메시, 유선과 해석 진행률을 표시합니다.</sub></p>

<p align="center"><img src="docs/images/stencil-3d.png" alt="lmBox에서 표시한 예제 3D 솔더 페이스트 스텐실" width="1000"></p>

<p align="center"><strong>3D 스텐실 모델 · STEP 내보내기 예정</strong><br><sub>Gerber에서 스텐실 모델을 만들고 두께, 테두리와 개구부 보정을 설정합니다. 이미지는 예제 보드이며, STEP 내보내기·슬라이싱·G-code 출력은 예정된 기능입니다.</sub></p>

## 아키텍처

기능별로 구성된 모듈형 모놀리스입니다. Vue는 작업 공간을 제공하고, Rust는 가져오기·버전별 작업·네이티브 프로세스를 조정하며, Python과 Fortran은 기하 및 수치 계산을 담당합니다. 실제 슬라이서 연동은 구현 예정입니다.

```text
Vue → 데스크톱/개발 어댑터 → Rust → Python 기하 연산 / CFD 어댑터
                               → Fortran 수치 계산
```

| 구성 요소 | 역할 | 문서 |
| --- | --- | --- |
| Vue | Feature-first 작업 공간, 문서 상태와 2D·3D 시각화 | [프런트엔드](frontend/agent-frontend.md) |
| Rust / Tauri | 가져오기, 파싱, 버전별 작업, 네이티브 프로세스 관리 및 내보내기 | [비즈니스 코어](src-rust/agent-rust.md), [데스크톱 호스트](desktop/tauri/agent-rust.md) |
| Python | 기하 연산, 스텐실 모델과 검사, FreeCAD/CfdOF 연동; OpenFOAM/HiSA 해석과 ParaView/VTK 결과 읽기 | [계산 엔진](engine/agent-python.md) |
| Fortran | CEA 열화학, 노즐과 인젝터 계산 | [수치 계산 백엔드](src-fortran/agent-fortran.md) |
| 슬라이서 (예정) | 슬라이싱 및 G-code 생성 | [슬라이싱](frontend/modules/stencil/lib/features/slicing/agent-frontend-slicing.md) |
| contracts | 버전별 데이터·명령·이벤트·산출물 형식 규약 | [언어 간 규약](contracts/AGENTS.md) |

[프로젝트 작업 규칙](AGENTS.md)
