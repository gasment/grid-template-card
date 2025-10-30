# grid-template-card
### A homeassistant customizable card with grid layout control
### 一个为Homeassistant Dashboard设计的自定义卡片
### 可视为button-card的精简版，相同配置的用法基本一致
### 与button-card的最大区别是，此卡片首要功能是作为容器卡片，为内嵌的子卡片提供grid网格布局控制，
### 不使用全局刷新机制，支持hass对象透传，内嵌卡片能够自主更新状态，从而避免了button-card内嵌的一些弹窗控件和交互动画失效问题
### 保留了一些元素与点击功能，可以实现基础按钮功能

#### 此项目全部功能实现代码由AI生成 Power By ChatGPT
---
### 安装说明：
方法一：
下载release中的grid_template_card.js文件，放入homeassistant 的 /config/www 下的任意文件夹内（给予执行权限），在HA设置->仪表盘中添加资源文件路径/local/xxxxx

方法二：
复制本项目仓库地址：https://github.com/gasment/grid-template-card ,在HACS添加Custom repositories，Repositories填写仓库地址，Type选择Dashboard； 搜索：grid-template-card，下载安装，按提示刷新页面

### 卡片配置：
|配置项| 效果|使用说明| 配置示例|
| --- | --- | --- | ---|
|type|卡片调用| 必须| type: custom:grid-template-card|
|varibales|可配置变量，方便卡片复用与模板复用|可选，支持静态内容，或js模板动态返回，如果内嵌卡片也为grid-template-card，变量可以逐级向上读取| 见下文详情|
|template|卡片模板,可同一仪表盘内复用|可选，使用方法与button-card一致| 见下文详情|
|is_nested|是否为被嵌套环境|可选，如在嵌入到其他卡片内时，出现显示问题，可尝试启用此配置|is_nested: true|
|name|文本元素，受grid布局控制，不配置时不显示|可选，支持静态内容，或js模板动态返回|name: 我的名字|
|state|文本元素，受grid布局控制，不配置时不显示|可选，支持静态内容，或js模板动态返回|state: 12138|
|label|文本元素，受grid布局控制，不配置时不显示|可选，支持静态内容，或js模板动态返回|label: 我的标签|
|icon|图标元素，受grid布局控制，不配置时不显示|可选，支持内置mdi，或文件路径，支持js模板动态返回|icon: mdi:xxxxxx|
|tap_action_vibration|点击附带震动效果，仅支持官方APP,不支持web|可选，接受true/false|tap_action_vibration: true|
|tap_action_vibration_type|震动效果选择|可选，支持官方几种预设效果：success, warning, failure, light, medium, heavy, selection，不配置则默认heavy| tap_action_vibration_type: selection|
|tap_action|点击动作，调用HA服务|可选，支持HA标准action写法| 见下文详情|
|styles|卡片内各元素的css样式设置|可选，支持通用标准css样式插入|见下文详情|
|custom_grid_areas|内嵌子卡片的入口|可选，理论上支持所有卡片|见下文详情|

### js模板写法
- 基本与button-card一致
- 分行符使用“|”、“>-”，另起一行使用[[[···]]]包裹js代码
- 读取实体主属性使用：states[`your_entity_id`].state
- 读取实体附加属性使用：states[`your_entity_id`].attributes.xxxxx
- 可以使用变量代替实体id: states[`${variables.your_entity_id}`].state
- 支持赋值变量var/cont/let,支持if else 多行嵌套
- 使用return返回数值
- 示例：
    ```
    button_effect_color: |
        [[[
            var state = states[`sensor.entity`].state
            if (state === "off"){
            return "#D7DFED"
            } else if (state === "cool"){
            return "#2483FF"
            } else if (state === "heat"){
            return "#FF6B6B"
            } else if (state === "dry"){
            return "#54CEAE"
            } else if (state === "fan_only"){
            return "#4CCBA9"
            } else if (state === "auto"){
            return "#464BD8"
            } else {
            return "#D7DFED"
            }
        ]]]
    ```

### varibales用法
- 支持多个变量定义，每个变量支持静态或动态js模板
  ```
  variables:
    example_1: 114514
    example_2: |
        [[[
          var value = states[`light.entity`].state;
          if (value === "on"){
            return "打开"
          } else {
              return "关闭"
          }
        ]]]
    example_3: switch.my_switch
  ```
- 在卡片内使用变量：
  ```
  name: |
    [[[return variables.example_1]]]
  state: |
    [[[
      var value = states[`${variables.example_3}`].state;
      if (value === "on"){
        return "打开"
      } else {
          return "关闭"
      }
    ]]]
  ```
- 如果在此卡片内继续嵌套此卡片，variables可逐级向顶层查询获取，比如，当内嵌卡片全部为此卡片时，只需要在最外层定义变量即可


### template用法
- 与button-card用法一致，在仪表盘原始配置的views配置前插入grid_template_card_templates字段，如：
  ```
  grid_template_card_templates:
    my_card_template:
    ·····
  views:
    ····
  ```
- 在卡片中引用模板
  ```
  template: my_card_template
  ```
- 引用模板后，会自动合并现有卡片内配置与模板配置内容，存在相同配置时，卡片内配置会覆盖模板配置
- 模板可包含内嵌卡片，即使内嵌卡片不是grid-template-card

### tap_action用法
- 目前仅支持点击动作
- action和entity_id支持js模板和variables
  ```
  tap_action:
    action: switch.toggle
    target:
      entity_id: switch,your_entity
  ```
- 更多操作可参考开发者选项中的动作yaml配置

### styles用法
- styles支持通用标准css样式插入，仅支持如下预设入口
- styles -> grid，grid布局控制，使用方法同button-card
    ```
    styles:
      grid:
        - grid-template-areas: |
            "name  state"
            "icon  label"
            "area1 area2"
            "area3 area4"
        - grid-template-columns: auto auto
        - grid-template-rows: auto auto
        - align-content: center
        - align-items: center
        - justify-content: center
        - justify-items: center
    ``` 
- styles -> card，控制卡片最外部容器的样式
    ```
    styles:
      card:
        - padding: 0px
        - height: 180px
        - width: 320px
        - background: rgba(0,0,0,0)
        - border-radius: 20px
    ```
- styles -> name/state/label，配置3个文本元素的样式
    ```
    styles:
      name:
        - font-size: 16px
      state:
        - color: red
      label:
        - letter-spacing: 6px
    ```
- styles -> icon
    ```
    styles:
      icon:
        - height: 30px
        - width: 30px
    ```
- styles -> custom_grid_areas，控制每个grid-template-areas的容器外部样式
    ```
    styles:
      custom_grid_areas:
        area1:
          - padding: 6px
        area2:
         - margin-left: -10px

    ```

### custom_grid_areas用法
- 子入口必须与styles -> grid中配置的自定义区域相符
  ```
  custom_grid_areas:
    area1:
      card:
        type:xxxxxxxx #其他卡片yaml
        ····
    area2
      card:
        type:xxxxxxxx
        ····
  ```



### 完整配置示例：
```
type: custom:grid-template-card
name: xxx
state: xxx
icon: xxx
label: xxx
varibales:
  aaa: xxxx
  bbb: |
    [[[
        var value = states[`entity_id`].state;
        return value;
    ]]]
template: xxxxx
tap_action_vibration: true
tap_action_vibration_type: success
styles:
  grid:
    - grid-template-areas: |
        "name  state"
        "icon  label"
        "area1 area2"
        "area3 area4"
    - grid-template-columns: auto auto
    - grid-template-rows: auto auto
    - align-content: center
    - align-items: center
    - justify-content: center
    - justify-items: center
  card:
    - padding: 0px
    - height: 180px
    - width: 320px
    - background: rgba(0,0,0,0)
    - border-radius: 20px
    - -webkit-tap-highlight-color: transparent  #禁止移动端交互阴影效果
  name:
    - font-size: 15px
  state:
    - color: red
  label:
    - letter-spacing: 3px
  icon:
    - height: 30px
    - width: 30px
  custom_grid_areas:
    area1:
      - padding: 6px
    area2:
      - padding: 3px
    area3:
      - padding: 3px
    area4:
      - padding: 3px
custom_grid_areas:
  area1:
    card:
        type: custom:button-card
```
