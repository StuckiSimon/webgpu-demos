(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  // Result Matrix

  const resultMatrixBufferSize = Float32Array.BYTES_PER_ELEMENT * (2 * 2);
  const resultMatrixBuffer = device.createBuffer({
    size: resultMatrixBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Bind group layout and bind group

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: resultMatrixBuffer,
        },
      },
    ],
  });

  // Compute shader code

  const shaderModule = device.createShaderModule({
    code: `
      struct Data {
        numbers: array<f32>;
      };
      
      [[group(0), binding(0)]] var<storage, write> logs : Data;
      
      [[stage(compute), workgroup_size(2, 2)]]
      fn main([[builtin(global_invocation_id)]] global_id : vec3<u32>) {
        let logIndex: u32 = global_id.x + (global_id.y * 2u);
        logs.numbers[logIndex] = 1.0;
      }
    `,
  });

  // Pipeline setup

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: shaderModule,
      entryPoint: "main",
    },
  });

  // Commands submission

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatch(1);
  passEncoder.endPass();

  // Get a GPU buffer for reading in an unmapped state.
  const gpuReadBuffer = device.createBuffer({
    size: resultMatrixBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Encode commands for copying buffer to buffer.
  commandEncoder.copyBufferToBuffer(
    resultMatrixBuffer /* source buffer */,
    0 /* source offset */,
    gpuReadBuffer /* destination buffer */,
    0 /* destination offset */,
    resultMatrixBufferSize /* size */
  );

  // Submit GPU commands.
  const gpuCommands = commandEncoder.finish();
  device.queue.submit([gpuCommands]);

  // Read buffer.
  await gpuReadBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = gpuReadBuffer.getMappedRange();
  console.log(new Float32Array(arrayBuffer));
})();
