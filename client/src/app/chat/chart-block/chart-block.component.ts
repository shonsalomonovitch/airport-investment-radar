import {
  Component,
  Input,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import {
  Chart,
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(BarController, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface ChartConfig {
  title: string;
  labels: string[];
  values: number[];
}

const BAR_COLORS = [
  'rgba(99,102,241,0.85)',
  'rgba(20,184,166,0.85)',
  'rgba(249,115,22,0.85)',
  'rgba(139,92,246,0.85)',
];

@Component({
  selector: 'app-chart-block',
  standalone: true,
  templateUrl: './chart-block.component.html',
  styleUrl: './chart-block.component.css',
})
export class ChartBlockComponent implements AfterViewInit, OnDestroy {
  @Input() raw = '';
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  parseError = false;

  ngAfterViewInit(): void {
    let config: ChartConfig;
    try {
      config = JSON.parse(this.raw);
    } catch {
      this.parseError = true;
      return;
    }

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'bar',
      data: {
        labels: config.labels,
        datasets: [
          {
            data: config.values,
            backgroundColor: config.labels.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]),
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          title: {
            display: !!config.title,
            text: config.title,
            font: { size: 13, weight: 'bold' },
            padding: { bottom: 10 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y}/100`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
