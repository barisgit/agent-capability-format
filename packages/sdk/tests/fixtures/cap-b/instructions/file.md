---
name: file
description: File-triggered cap-b instruction
activation:
  when:
    file_context:
      paths: ["src/**/*.ts"]
---
Include cap-b instruction for file context.
