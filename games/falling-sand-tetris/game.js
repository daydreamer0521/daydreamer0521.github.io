// 游戏配置
const CONFIG = {
    // 逻辑网格 (俄罗斯方块的标准 10x20)
    LOGICAL_COLS: 10,
    LOGICAL_ROWS: 20,

    // 物理网格比例 (每个逻辑格细分为 4x4 像素)
    GRID_SCALE: 4,

    // 实际物理网格大小
    get COLS() { return this.LOGICAL_COLS * this.GRID_SCALE; }, // 40
    get ROWS() { return this.LOGICAL_ROWS * this.GRID_SCALE; }, // 80

    // 渲染参数
    BLOCK_SIZE: 30, // 逻辑格子的显示大小 (px)
    get PIXEL_SIZE() { return this.BLOCK_SIZE / this.GRID_SCALE; }, // 单个沙粒的显示大小 (7.5px)

    // 颜色定义 (对应 7 种方块)
    // 0 是空，1-7 是颜色
    COLORS: [
        'transparent', // 0
        '#FF6B6B', // I - Red
        '#4ECDC4', // O - Teal
        '#45B7D1', // T - Blue
        '#FFA07A', // S - Orange
        '#98D8C8', // Z - Green
        '#F7DC6F', // J - Yellow
        '#BB8FCE'  // L - Purple
    ],

    INITIAL_SPEED: 1000,
    SPEED_DECREASE: 50,
    MIN_SPEED: 100
};

// 俄罗斯方块形状定义 (逻辑坐标)
const SHAPES = [
    [[1, 1, 1, 1]], // I (Color 1)
    [[1, 1], [1, 1]], // O (Color 2)
    [[0, 1, 0], [1, 1, 1]], // T (Color 3)
    [[0, 1, 1], [1, 1, 0]], // S (Color 4)
    [[1, 1, 0], [0, 1, 1]], // Z (Color 5)
    [[1, 0, 0], [1, 1, 1]], // J (Color 6)
    [[0, 0, 1], [1, 1, 1]]  // L (Color 7)
];

class SandTetris {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // 优化性能
        this.nextCanvas = document.getElementById('nextCanvas');
        this.nextCtx = this.nextCanvas.getContext('2d');

        // 设置画布大小
        this.canvas.width = CONFIG.LOGICAL_COLS * CONFIG.BLOCK_SIZE;
        this.canvas.height = CONFIG.LOGICAL_ROWS * CONFIG.BLOCK_SIZE;
        this.nextCanvas.width = 4 * CONFIG.BLOCK_SIZE;
        this.nextCanvas.height = 4 * CONFIG.BLOCK_SIZE;

        // 核心数据结构：物理网格
        // 存储每个像素的颜色索引 (0-7)
        this.grid = new Int8Array(CONFIG.COLS * CONFIG.ROWS).fill(0);

        // 游戏状态
        this.score = 0;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;

        // 活动方块
        this.activePiece = null;
        this.nextPieceShape = null;
        this.nextPieceColor = 0;

        // 定时器与循环
        this.lastTime = 0;
        this.dropCounter = 0;
        this.dropInterval = CONFIG.INITIAL_SPEED;
        this.animationId = null;

        this.init();
    }

    init() {
        this.setupControls();
        this.nextPieceShape = this.randomShape();
        this.nextPieceColor = this.randomColor(this.nextPieceShape);
        this.spawnPiece();
        this.startGame();
    }

    setupControls() {
        document.addEventListener('keydown', (e) => {
            if (this.gameOver) return;
            switch (e.key) {
                case 'ArrowLeft': e.preventDefault(); this.movePiece(-1, 0); break;
                case 'ArrowRight': e.preventDefault(); this.movePiece(1, 0); break;
                case 'ArrowDown': e.preventDefault(); this.movePiece(0, 1); break;
                case 'ArrowUp': e.preventDefault(); this.rotatePiece(); break;
                case ' ': e.preventDefault(); this.hardDrop(); break;
                case 'p': case 'P': e.preventDefault(); this.togglePause(); break;
            }
        });

        // 按钮绑定
        document.getElementById('pauseBtn').onclick = () => this.togglePause();
        const restart = () => this.restart();
        document.getElementById('newGameBtn').onclick = restart;
        document.getElementById('restartBtn').onclick = restart;

        // 移动端
        document.getElementById('leftBtn').onclick = () => this.movePiece(-1, 0);
        document.getElementById('rightBtn').onclick = () => this.movePiece(1, 0);
        document.getElementById('downBtn').onclick = () => this.movePiece(0, 1);
        document.getElementById('rotateBtn').onclick = () => this.rotatePiece();
        document.getElementById('dropBtn').onclick = () => this.hardDrop();
    }

    randomShape() {
        return SHAPES[Math.floor(Math.random() * SHAPES.length)];
    }

    randomColor(shape) {
        // 通常俄罗斯方块形状和颜色是绑定的，这里为了视觉丰富度，我们简化处理：
        // 也可以直接用 shape 的索引来定颜色
        const shapeIndex = SHAPES.indexOf(shape);
        return shapeIndex + 1;
    }

    // 生成新方块 (转换逻辑形状 -> 物理像素形状)
    spawnPiece() {
        const shape = this.nextPieceShape;
        const color = this.nextPieceColor;

        // 准备下一个
        this.nextPieceShape = this.randomShape();
        this.nextPieceColor = this.randomColor(this.nextPieceShape);
        this.drawNextPiece();

        // 构建物理像素形状
        // 逻辑形状是 1(存在), 物理形状要是 scale*scale 的像素块
        const pixelShape = [];
        const scale = CONFIG.GRID_SCALE;

        const shapeH = shape.length;
        const shapeW = shape[0].length;

        for (let r = 0; r < shapeH; r++) {
            for (let c = 0; c < shapeW; c++) {
                if (shape[r][c]) {
                    // 每个逻辑格变成 scale*scale 的像素
                    for (let pr = 0; pr < scale; pr++) {
                        for (let pc = 0; pc < scale; pc++) {
                            pixelShape.push({
                                x: c * scale + pc,
                                y: r * scale + pr
                            });
                        }
                    }
                }
            }
        }

        // 初始位置 (物理坐标)
        // 居中显示: (总物理宽 - 形状物理宽) / 2
        // 逻辑宽 * scale
        const piecePixelW = shapeW * scale;
        const startX = Math.floor((CONFIG.COLS - piecePixelW) / 2);
        const startY = 0;

        this.activePiece = {
            x: startX,
            y: startY,
            pixels: pixelShape, // 相对坐标
            color: color,
            width: shapeW * scale,
            height: shapeH * scale,
            logicalShape: shape //以此支持旋转
        };

        // 检查出生点碰撞
        if (this.checkCollision(this.activePiece.x, this.activePiece.y, this.activePiece.pixels)) {
            this.endGame();
        }
    }

    // 碰撞检测
    // x, y: 左上角物理坐标
    // pixels: 相对坐标数组
    checkCollision(x, y, pixels) {
        for (const p of pixels) {
            const px = x + p.x;
            const py = y + p.y;

            // 检查边界
            if (px < 0 || px >= CONFIG.COLS || py >= CONFIG.ROWS) {
                return true;
            }

            // 检查网格是否有沙子 (py < 0 时还没进场，不算撞)
            if (py >= 0) {
                const idx = py * CONFIG.COLS + px;
                if (this.grid[idx] !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    movePiece(dx, dy) {
        // dx, dy 是逻辑单位 (1格) -> 物理单位 (scale像素)
        // 为了手感，左右移动一次是一个逻辑格 (scale像素)
        // 下落可以是 1像素 (平滑) 或者 1逻辑格 (传统)
        // 这里设定：左右移动 = scale像素，下落 = scale像素 (保持对齐)

        const pixelDx = dx * CONFIG.GRID_SCALE;
        const pixelDy = dy * CONFIG.GRID_SCALE;

        if (!this.activePiece || this.gameOver || this.paused) return;

        if (!this.checkCollision(this.activePiece.x + pixelDx, this.activePiece.y + pixelDy, this.activePiece.pixels)) {
            this.activePiece.x += pixelDx;
            this.activePiece.y += pixelDy;
        } else {
            // 如果是下落碰撞 -> 锁定
            if (dy > 0) {
                this.lockPiece();
            }
        }
    }

    rotatePiece() {
        if (!this.activePiece || this.gameOver || this.paused) return;

        // 旋转逻辑形状
        const oldLogShape = this.activePiece.logicalShape;
        const rows = oldLogShape.length;
        const cols = oldLogShape[0].length;
        const newLogShape = Array(cols).fill(null).map(() => Array(rows).fill(0));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                newLogShape[c][rows - 1 - r] = oldLogShape[r][c];
            }
        }

        // 重新生成像素形状
        const scale = CONFIG.GRID_SCALE;
        const newPixels = [];
        for (let r = 0; r < newLogShape.length; r++) {
            for (let c = 0; c < newLogShape[0].length; c++) {
                if (newLogShape[r][c]) {
                    for (let pr = 0; pr < scale; pr++) {
                        for (let pc = 0; pc < scale; pc++) {
                            newPixels.push({
                                x: c * scale + pc,
                                y: r * scale + pr
                            });
                        }
                    }
                }
            }
        }

        // 尝试旋转，如果碰撞则踢墙 (简易版)
        if (!this.checkCollision(this.activePiece.x, this.activePiece.y, newPixels)) {
            this.activePiece.pixels = newPixels;
            this.activePiece.logicalShape = newLogShape;
            this.activePiece.width = newLogShape[0].length * scale;
            this.activePiece.height = newLogShape.length * scale;
        }
    }

    hardDrop() {
        if (!this.activePiece || this.gameOver || this.paused) return;

        let dropped = 0;
        // 每次下落 1 个物理像素精度
        while (!this.checkCollision(this.activePiece.x, this.activePiece.y + 1, this.activePiece.pixels)) {
            this.activePiece.y += 1;
            dropped++;
        }
        this.lockPiece();
    }

    lockPiece() {
        // 将方块像素写入 grid
        for (const p of this.activePiece.pixels) {
            const px = this.activePiece.x + p.x;
            const py = this.activePiece.y + p.y;

            if (px >= 0 && px < CONFIG.COLS && py >= 0 && py < CONFIG.ROWS) {
                const idx = py * CONFIG.COLS + px;
                this.grid[idx] = this.activePiece.color;
            }
        }

        this.activePiece = null;
        this.spawnPiece();
    }

    // --- 核心物理引擎：元胞自动机 ---
    updatePhysics() {
        // 从下往上，从左往右 (或随机左右) 遍历
        let moved = false;

        for (let y = CONFIG.ROWS - 2; y >= 0; y--) { // 最下面一行不用检查
            // 随机左右遍历顺序，防止沙堆总是倾向一边
            const width = CONFIG.COLS;
            const rowOffset = y * width;
            const nextRowOffset = (y + 1) * width;

            // 创建随机遍历顺序
            const startX = Math.random() < 0.5 ? 0 : width - 1;
            const step = startX === 0 ? 1 : -1;

            for (let i = 0; i < width; i++) {
                const x = startX + i * step;
                const idx = rowOffset + x;
                const color = this.grid[idx];

                if (color === 0) continue; // 空气

                // 下方索引
                const downIdx = nextRowOffset + x;

                // 1. 尝试直接向下
                if (this.grid[downIdx] === 0) {
                    this.grid[downIdx] = color;
                    this.grid[idx] = 0;
                    moved = true;
                }
                // 2. 尝试左下或右下 (随机顺序)
                else {
                    const tryLeft = Math.random() < 0.5;
                    const dirs = tryLeft ? [-1, 1] : [1, -1];

                    for (const dx of dirs) {
                        const nx = x + dx;
                        if (nx >= 0 && nx < width) {
                            const slideIdx = nextRowOffset + nx;
                            if (this.grid[slideIdx] === 0) {
                                this.grid[slideIdx] = color;
                                this.grid[idx] = 0;
                                moved = true;
                                break; // 移动成功，停止尝试
                            }
                        }
                    }
                }
            }
        }
        return moved;
    }

    // --- 消除逻辑：同色连通 ---
    checkSandtrixLines() {
        // 只有当没有正在进行的消除动画时才检查
        if (this.isClearing) return;

        const width = CONFIG.COLS;
        const height = CONFIG.ROWS;
        const visited = new Uint8Array(width * height); // 标记本次检查访问过的
        let cleared = false;
        let particlesToRemove = [];

        // 只需要遍历最左边一列
        for (let y = 0; y < height; y++) {
            const startIdx = y * width; // x=0
            const color = this.grid[startIdx];

            if (color === 0 || visited[startIdx]) continue;

            // 开始 Flood Fill
            const queue = [startIdx];
            const component = []; // 连通分量的所有索引
            visited[startIdx] = 1;
            component.push(startIdx);

            let reachedRight = false;

            let head = 0;
            while (head < queue.length) {
                const currIdx = queue[head++];
                const cx = currIdx % width;
                const cy = Math.floor(currIdx / width);

                if (cx === width - 1) {
                    reachedRight = true;
                }

                // 检查 4 邻域 (上下左右)
                const neighbors = [
                    { x: cx + 1, y: cy }, { x: cx - 1, y: cy },
                    { x: cx, y: cy + 1 }, { x: cx, y: cy - 1 }
                ];

                for (const n of neighbors) {
                    if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
                        const nIdx = n.y * width + n.x;
                        if (!visited[nIdx] && this.grid[nIdx] === color) {
                            visited[nIdx] = 1;
                            queue.push(nIdx);
                            component.push(nIdx);
                        }
                    }
                }
            }

            // 如果连通到右边，消除！
            if (reachedRight) {
                cleared = true;
                particlesToRemove.push(...component);
                // 计分
                this.score += Math.floor(component.length / CONFIG.GRID_SCALE) * 10;
            }
        }

        if (cleared) {
            this.isClearing = true;
            this.updateScore();
            // 直接消除
            for (const idx of particlesToRemove) {
                this.grid[idx] = 0;
            }
            this.isClearing = false;
        }
    }

    updateScore() {
        document.getElementById('score').textContent = this.score;
        const newLevel = Math.floor(this.score / 1000) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            document.getElementById('level').textContent = this.level;

            // 速度随等级增加
            this.dropInterval = Math.max(CONFIG.MIN_SPEED, CONFIG.INITIAL_SPEED - (this.level - 1) * CONFIG.SPEED_DECREASE);
        }
    }

    togglePause() {
        if (this.gameOver) return;
        this.paused = !this.paused;
        document.getElementById('pauseBtn').textContent = this.paused ? '继续' : '暂停';
        if (!this.paused) {
            this.lastTime = performance.now();
            this.gameLoop(this.lastTime);
        }
    }

    restart() {
        this.grid.fill(0);
        this.score = 0;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;
        this.isClearing = false;
        this.updateScore();
        document.getElementById('level').textContent = 1;
        document.getElementById('gameOver').classList.add('hidden');
        document.getElementById('pauseBtn').textContent = '暂停';

        this.spawnPiece();
        this.lastTime = performance.now();
    }

    endGame() {
        this.gameOver = true;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOver').classList.remove('hidden');
    }

    gameLoop(timestamp) {
        if (this.paused || this.gameOver) return;

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // 1. 活动方块下落逻辑
        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.movePiece(0, 1);
            this.dropCounter = 0;
        }

        // 2. 物理更新 (每帧执行几次以加快流速?)
        // 为了平滑流沙效果，一般每帧更新一次即可，如果想流得快，可以 loop 2-3 次
        this.updatePhysics();
        this.updatePhysics(); // Double speed sand

        // 3. 实时检查消除！
        // 放在物理更新之后，渲染之前
        this.checkSandtrixLines();

        // 4. 渲染
        this.draw();

        this.animationId = requestAnimationFrame(t => this.gameLoop(t));
    }

    startGame() {
        this.lastTime = performance.now();
        this.gameLoop(this.lastTime);
    }

    // --- 渲染 ---
    draw() {
        // 清空背景
        this.ctx.fillStyle = '#000000'; // 背景色
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 获取像素数据直接操作可能更快，但 fillRect 对于几千个点也完全够快
        const pixelSize = CONFIG.PIXEL_SIZE;

        // 1. 绘制静态网格
        // 优化：相邻同色可以合并绘制吗？本身像素就很小，直接画就行。
        for (let idx = 0; idx < this.grid.length; idx++) {
            const colorIdx = this.grid[idx];
            if (colorIdx !== 0) {
                const x = idx % CONFIG.COLS;
                const y = Math.floor(idx / CONFIG.COLS);

                this.ctx.fillStyle = CONFIG.COLORS[colorIdx];
                // 绘制像素，稍微留一点点缝隙或者紧密都可以
                // 紧密绘制看起来像液体
                this.ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
            }
        }

        // 2. 绘制活动方块
        if (this.activePiece) {
            this.ctx.fillStyle = CONFIG.COLORS[this.activePiece.color];
            for (const p of this.activePiece.pixels) {
                const x = this.activePiece.x + p.x;
                const y = this.activePiece.y + p.y;
                this.ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
            }
        }

        // 3. 绘制辅助网格线（可选，画在大格子上）
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for (let c = 0; c <= CONFIG.LOGICAL_COLS; c++) {
            this.ctx.beginPath();
            this.ctx.moveTo(c * CONFIG.BLOCK_SIZE, 0);
            this.ctx.lineTo(c * CONFIG.BLOCK_SIZE, this.canvas.height);
            this.ctx.stroke();
        }
        for (let r = 0; r <= CONFIG.LOGICAL_ROWS; r++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, r * CONFIG.BLOCK_SIZE);
            this.ctx.lineTo(this.canvas.width, r * CONFIG.BLOCK_SIZE);
            this.ctx.stroke();
        }
    }

    drawNextPiece() {
        this.nextCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);

        if (!this.nextPieceShape) return;

        const shape = this.nextPieceShape;
        const color = CONFIG.COLORS[this.nextPieceColor];
        const blockSize = CONFIG.BLOCK_SIZE;

        // 居中计算
        const offsetX = (4 - shape[0].length) * blockSize / 2;
        const offsetY = (4 - shape.length) * blockSize / 2;

        this.nextCtx.fillStyle = color;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c]) {
                    this.nextCtx.fillRect(offsetX + c * blockSize + 1, offsetY + r * blockSize + 1, blockSize - 2, blockSize - 2);
                    // 加上边框让它看起来像方块
                    this.nextCtx.strokeStyle = 'rgba(0,0,0,0.5)';
                    this.nextCtx.strokeRect(offsetX + c * blockSize + 1, offsetY + r * blockSize + 1, blockSize - 2, blockSize - 2);
                }
            }
        }
    }
}

// 启动
window.addEventListener('load', () => new SandTetris());
