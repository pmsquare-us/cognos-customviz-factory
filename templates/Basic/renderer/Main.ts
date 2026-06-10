import { RenderBase } from "@businessanalytics/customvis-lib";

export default class extends RenderBase
{
    protected create( _node: HTMLElement ): HTMLElement
    {
        _node.textContent = "Basic VizBundle";
        return _node;
    }
}
