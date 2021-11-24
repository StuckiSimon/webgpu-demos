const vertexShader = `
[[stage(vertex)]]
fn main([[location(0)]] inPos: vec3<f32>) -> [[builtin(position)]] vec4<f32> {
  return vec4<f32>(inPos, 1.0);
}
`;

const fragmentShader = `
[[stage(fragment)]]
fn main() -> [[location(0)]] vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`;

(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const queue = device.queue;

  const canvas = document.getElementById("canvas");
  const context = canvas.getContext("webgpu");

  const canvasConfig = {
    device,
    format: "bgra8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  };

  context.configure(canvasConfig);

  const colorTexture = context.getCurrentTexture();
  const colorTextureView = colorTexture.createView();

  const positions = new Float32Array([
    // vertex 0
    1.0, -1.0, 0.0,
    // vertex 1
    -1.0, -1.0, 0.0,
    // vertex 2
    0.0, 1.0, 0.0,
  ]);

  const indices = new Uint16Array([0, 1, 2]);

  const createBuffer = (arr, usage) => {
    const desc = {
      size: Math.ceil(arr.byteLength / 4) * 4,
      usage,
      mappedAtCreation: true,
    };
    const buffer = device.createBuffer(desc);

    const mappedRange = buffer.getMappedRange();

    const writeArray =
      arr instanceof Uint16Array
        ? new Uint16Array(mappedRange)
        : new Float32Array(mappedRange);
    writeArray.set(arr);
    buffer.unmap();
    return buffer;
  };

  const positionBuffer = createBuffer(positions, GPUBufferUsage.VERTEX);
  const indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);

  const vertModule = device.createShaderModule({ code: vertexShader });

  const fragModule = device.createShaderModule({ code: fragmentShader });

  const positionAttribDesc = {
    shaderLocation: 0,
    offset: 0,
    format: "float32x3",
  };
  const positionBufferDesc = {
    attributes: [positionAttribDesc],
    arrayStride: positions.BYTES_PER_ELEMENT * 3, // x y z
    stepMode: "vertex",
  };

  const vertex = {
    module: vertModule,
    entryPoint: "main",
    buffers: [positionBufferDesc],
  };

  const colorState = {
    format: "bgra8unorm",
  };

  const fragment = {
    module: fragModule,
    entryPoint: "main",
    targets: [colorState],
  };

  const pipelineDesc = {
    vertex,
    fragment,
  };

  const pipeline = device.createRenderPipeline(pipelineDesc);

  const colorAttachment = {
    view: colorTextureView,
    loadValue: { r: 1, g: 1, b: 1, a: 1 },
    storeOp: "store",
  };

  const renderPassDesc = {
    colorAttachments: [colorAttachment],
  };

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, positionBuffer);
  passEncoder.setIndexBuffer(indexBuffer, "uint16");
  passEncoder.drawIndexed(3, 1);
  passEncoder.endPass();

  queue.submit([commandEncoder.finish()]);
})();
