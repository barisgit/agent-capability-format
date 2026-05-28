---
name: operation
description: Operation-triggered cap-a instruction
activation:
  when:
    operation_input:
      conditions: ["shell"]
only: [pi]
---
Include cap-a instruction for operation input.
