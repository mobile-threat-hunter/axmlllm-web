# axmlllm-web

axmlllm(AXML/AndroidManifest 분석 라이브러리)의 기능을 브라우저에서 육안으로 확인하는 웹 데모.

- 소스 라이브러리: `/home/nyahumi/Project/axmlllm`
- 참조 구현: `/home/nyahumi/Project/dexllm-web` — dexllm을 WASM으로 빌드해 정적 페이지(index.html + dexllm.js/dexllm.wasm)로 띄운 구조를 그대로 따를 것
- dexllm-web 교훈: WASM은 **단일 스레드로 빌드**해야 함 (멀티스레드 빌드 시 파일 로드 실패)
