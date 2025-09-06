import * as record from 'node-record-lpcm16';
import Pitchfinder from 'pitchfinder';
import chalk from 'chalk';

// ギターの標準チューニング (周波数 Hz)
interface GuitarString {
    name: string;
    frequency: number;
    note: string;
}

const GUITAR_STRINGS: GuitarString[] = [
    { name: '6弦', frequency: 82.41, note: 'E2' },
    { name: '5弦', frequency: 110.00, note: 'A2' },
    { name: '4弦', frequency: 146.83, note: 'D3' },
    { name: '3弦', frequency: 196.00, note: 'G3' },
    { name: '2弦', frequency: 246.94, note: 'B3' },
    { name: '1弦', frequency: 329.63, note: 'E4' }
];

// 許容誤差 (セント)
const TOLERANCE_CENTS = 5;

class GuitarTuner {
    private detectPitch: any;
    private sampleRate: number = 44100;
    private recording: any;
    private currentFrequency: number | null = null;
    private isRunning: boolean = false;

    constructor() {
        // YIN アルゴリズムを使用（ギターに適している）
        this.detectPitch = Pitchfinder.YIN({
            sampleRate: this.sampleRate,
            threshold: 0.1
        });
    }

    // 周波数をセントに変換（基準周波数との差）
    private frequencyToCents(frequency: number, referenceFreq: number): number {
        return 1200 * Math.log2(frequency / referenceFreq);
    }

    // 最も近い弦を見つける
    private findClosestString(frequency: number): { string: GuitarString; cents: number } | null {
        if (!frequency || frequency < 50 || frequency > 2000) return null;

        let closestString = GUITAR_STRINGS[0];
        let minCents = Math.abs(this.frequencyToCents(frequency, GUITAR_STRINGS[0].frequency));

        for (const string of GUITAR_STRINGS) {
            const cents = Math.abs(this.frequencyToCents(frequency, string.frequency));
            if (cents < minCents) {
                minCents = cents;
                closestString = string;
            }
        }

        const cents = this.frequencyToCents(frequency, closestString.frequency);
        return { string: closestString, cents };
    }

    // チューニング状態を表示
    private displayTuning(frequency: number): void {
        const result = this.findClosestString(frequency);

        if (!result) {
            console.clear();
            console.log(chalk.yellow('音が検出されません...'));
            return;
        }

        const { string, cents } = result;

        console.clear();
        console.log(chalk.cyan('=== ギターチューナー ===\n'));
        console.log(`検出周波数: ${chalk.white(frequency.toFixed(2))} Hz`);
        console.log(`最も近い弦: ${chalk.magenta(string.name)} (${string.note} - ${string.frequency} Hz)\n`);

        // ビジュアルメーター
        const meterWidth = 50;
        const centerPos = Math.floor(meterWidth / 2);
        const markerPos = centerPos + Math.floor(cents / 100 * centerPos);

        let meter = '';
        for (let i = 0; i < meterWidth; i++) {
            if (i === centerPos) {
                meter += '|';
            } else if (i === Math.max(0, Math.min(meterWidth - 1, markerPos))) {
                meter += '●';
            } else {
                meter += '-';
            }
        }

        console.log('  低い                    正確                    高い');
        console.log(`  ${meter}`);
        console.log(`  差: ${cents > 0 ? '+' : ''}${cents.toFixed(1)} セント\n`);

        // チューニング状態
        if (Math.abs(cents) <= TOLERANCE_CENTS) {
            console.log(chalk.green.bold('✓ 完璧です！'));
        } else if (cents < -TOLERANCE_CENTS) {
            console.log(chalk.red(`↑ ${Math.abs(cents).toFixed(1)} セント低いです - 弦を締めてください`));
        } else {
            console.log(chalk.red(`↓ ${cents.toFixed(1)} セント高いです - 弦を緩めてください`));
        }

        console.log('\n' + chalk.gray('Ctrl+C で終了'));
    }

    // 録音開始
    public start(): void {
        if (this.isRunning) return;

        console.log(chalk.cyan('ギターチューナーを起動中...\n'));
        console.log(chalk.yellow('ギターを弾いてください\n'));

        this.isRunning = true;

        // マイクから録音開始
        this.recording = record.record({
            sampleRate: this.sampleRate,
            channels: 1,
            audioType: 'raw',
            encoding: 'signed-integer',
            endian: 'little',
            bitDepth: 16
        });

        let buffer = Buffer.alloc(0);

        this.recording.stream()
            .on('data', (data: Buffer) => {
                buffer = Buffer.concat([buffer, data]);

                // バッファサイズが十分になったら処理
                if (buffer.length >= 8192) {
                    const float32Array = new Float32Array(buffer.length / 2);

                    // 16bit signed integer を float32 に変換
                    for (let i = 0; i < buffer.length / 2; i++) {
                        const int16 = buffer.readInt16LE(i * 2);
                        float32Array[i] = int16 / 32768.0;
                    }

                    // ピッチ検出
                    const pitch = this.detectPitch(float32Array);

                    if (pitch && pitch > 50) {
                        this.currentFrequency = pitch;
                        this.displayTuning(pitch);
                    }

                    // バッファをリセット
                    buffer = Buffer.alloc(0);
                }
            })
            .on('error', (err: Error) => {
                console.error(chalk.red('エラー:', err.message));
                this.stop();
            });
    }

    // 録音停止
    public stop(): void {
        if (this.recording) {
            this.recording.stop();
            this.recording = null;
        }
        this.isRunning = false;
        console.log(chalk.cyan('\nチューナーを停止しました'));
    }
}

// メイン処理
const main = async () => {
    const tuner = new GuitarTuner();

    // 終了処理
    process.on('SIGINT', () => {
        tuner.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        tuner.stop();
        process.exit(0);
    });

    // チューナー開始
    tuner.start();
};

// エラーハンドリング
process.on('uncaughtException', (err) => {
    console.error(chalk.red('予期しないエラー:', err));
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('未処理のPromise rejection:', reason));
    process.exit(1);
});

// アプリケーション起動
main().catch((err) => {
    console.error(chalk.red('起動エラー:', err));
    process.exit(1);
});

// src/tuner-utils.ts (オプション: ユーティリティ関数)
export class TunerUtils {
    // 音名を周波数に変換（A4 = 440Hz基準）
    static noteToFrequency(note: string): number {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = parseInt(note.slice(-1));
        const noteName = note.slice(0, -1);
        const noteIndex = notes.indexOf(noteName);

        if (noteIndex === -1) throw new Error('Invalid note');

        const a4 = 440;
        const a4Index = notes.indexOf('A') + 4 * 12;
        const noteIndexTotal = noteIndex + octave * 12;
        const halfSteps = noteIndexTotal - a4Index;

        return a4 * Math.pow(2, halfSteps / 12);
    }

    // 周波数を最も近い音名に変換
    static frequencyToNote(frequency: number): string {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const a4 = 440;
        const halfSteps = Math.round(12 * Math.log2(frequency / a4));
        const noteIndex = (halfSteps + 9 + 48) % 12;
        const octave = Math.floor((halfSteps + 9 + 48) / 12);

        return notes[noteIndex] + octave;
    }
}