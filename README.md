# grid-template-card
### A homeassistant customizable card with grid layout control
### 一个为Homeassistant Dashboard设计的自定义卡片
### 提供了grid网格布局控制，参考了button-card的使用方式，剔除了grid选项外的其他功能，并支持hass对象的透传，没有强制刷新等机制，不干扰内嵌卡片的状态更新

#### 此项目全部功能实现代码由AI生成 Power By ChatGPT
---
### 安装说明：
方法一：
下载release中的grid_template_card.js文件，放入homeassistant 的 /config/www 下的任意文件夹内（给予执行权限），在HA设置->仪表盘中添加资源文件路径/local/xxxxx

方法二：
复制本项目仓库地址：https://github.com/gasment/grid-template-card ,在HACS添加Custom repositories，Repositories填写仓库地址，Type选择Dashboard； 搜索：grid-template-card，下载安装，按提示刷新页面

### 卡片配置：
1. 卡片调用(固定)
    ```
    type: custom:grid-template-card
    ```
2. grid:，grid网格定义
- 2.1. grid-template-areas，定义网格区域布局与名称
    ```
    grid:
        - grid-template-areas: |
            "area1 area2"
            "area3 area4"
    ```
- 2.2. grid-template-columns，grid网格列宽
    ```
    grid:
        - grid-template-columns: 50% 50%
    ```
- 2.3. grid-template-rows，grid网格行高
    ```
    grid:
        - grid-template-rows: auto auto
    ```
- 2.4. grid对齐方式:align-content/align-items/justify-content/justify-items
    ```
    grid:
      - align-content: center  #垂直
      - align-items: center
      - justify-content: center  #水平
      - justify-items: center
    ```
3. styles，部分容器样式控制，支持字段：card、grid
- 3.1 styles => card，控制最外层容器的样式
    ```
    styles:
        card:
            - padding: 0px
            - height: 180px  #总高度
            - width: 320px  #总宽度
            - background: rgba(0,0,0,0)
            - border-radius: 20px
    ```
- 3.2 styles => grid，控制grid容器的样式
    ```
    styles:
        grid:
            area1:
                - padding: 5px
            area2:
                - padding: 3px
            area3:
                - padding: 3px
            area4:
                - padding: 3px
    ```
4. grid_areas，grid区域内嵌内容，常用于内嵌其他卡片，eg.
    ```
    grid_areas:
      area1:
          card:
              type: custom:button-card
    ```
### 完整配置示例：
```
type: custom:grid-template-card
grid:
  - grid-template-areas: |
      "area1 area2"
      "area3 area4"
  - grid-template-columns: auto auto
  - grid-template-rows: auto auto
  - align-content: center
  - align-items: center
  - justify-content: center
  - justify-items: center
styles:
  card:
    - padding: 0px
    - height: 180px
    - width: 320px
    - background: rgba(0,0,0,0)
    - border-radius: 20px
  grid:
    area1:
      - padding: 5px
    area2:
      - padding: 3px
    area3:
      - padding: 3px
    area4:
      - padding: 3px
grid_areas:
  area1:
    card:
        type: custom:button-card
```
