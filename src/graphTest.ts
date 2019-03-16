import { Action } from './type';
import { getGraph } from './util/graph';
import printLog from './util/printLog';

type DirectoryItemData = {
  name: string,
};
type DirectoryItem = Action<DirectoryItemData, {}>;

function directory(
  inputs: TemplateStringsArray,
): { [key: string]: DirectoryItem } {
  const idTable: { [key: string]: number } = {};
  // This should be two-pass algorithm, as avcs doesn't support alias IDs, we
  // need to pre-assign IDs for each entry.
  const lines = inputs[0].trim().split('\n').map(v => v.split(' '));
  for (let i = 0; i < lines.length; i += 1) {
    const cols = lines[i];
    const ids = cols[0].split('_');
    for (const id of ids) {
      idTable[id] = i;
    }
  }
  const actionTable: { [key: string]: DirectoryItem } = {};
  // Generate graph data.
  for (let i = 0; i < lines.length; i += 1) {
    const cols = lines[i];
    const edges = cols.slice(1, -1).map(v => idTable[v]);
    const data = { name: cols[cols.length - 1] };
    const id = i.toString();
    const depth = lines.length - i;
    if (edges.length === 0) {
      actionTable[i] = { id, data, depth, type: 'init' };
    } else if (edges.length === 1) {
      actionTable[i] = {
        id,
        data,
        depth,
        parent: edges[0] + '',
        type: 'normal',
        undoData: {},
      };
    } else {
      actionTable[i] = {
        id,
        data,
        depth,
        parents: edges.map(v => ({
          id: v + '',
          data: [],
          undoData: [],
        })),
        type: 'merge',
      };
    }
  }
  return actionTable;
}

async function main(table: { [key: string]: DirectoryItem }) {
  async function * getHistory(startId: string = '0') {
    let action = table[startId];
    while (action != null) {
      yield action;
      let parentId;
      switch (action.type) {
        case 'normal':
          parentId = action.parent;
          break;
        case 'merge':
          // TODO Which branch should be followed? We can possibly retrieve
          // results from 'yield'.
          parentId = action.parents[0].id;
      }
      if (parentId == null) {
        break;
      } else {
        action = table[parentId];
      }
    }
  }
  const linePrinter = printLog(
    (action: DirectoryItem) => {
      return action.id.slice(0, 7) + ' ' + action.data.name;
    },
    getGraph(getHistory));
  for await (const line of linePrinter) {
    console.log(line);
  }
}

main(directory`
000 110 411 610 710 u110 start
110 111 의정부
111 112 회룡
112 113 망월사
710 711 장암
711_113 712 114 도봉산
712 713 수락산
713 714 마들
114 115 도봉
115 116 방학
411 412 당고개
412 413 상계
413_714 414 715 노원
414_116 415 117 창동
415 416 쌍문
416 417 수유
417 418 미아
418 419 미아사거리
419 420 길음
u110 u111 정릉
420_u111 421 u112 성신여대입구
421 422 한성대입구
422 423 혜화
117 118 녹천
118 119 월계
119 120 광운대
715 716 중계
716 717 하계
717 718 공릉
610 611 봉화산
611 612 화랑대
612_718 613 719 태릉입구
120_613 121 614 석계
614 615 돌곶이
615 616 상월곡
616 617 월곡
617 618 고려대
618 619 안암
619_u112 620 u113 보문
620 621 창신
121 122 신이문
122 123 외대앞
123 124 회기
124 125 청량리
125 126 제기동
126_u113 127 신설동
127_621 128 622 동묘앞
622 신당
423_128 424 129 동대문
424 425 동대문역사문화공원
129 종로5가
719 720 먹골
720 721 중화
721 상봉
`);
